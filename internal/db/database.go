package db

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/MKolega/AirsoftHubCroatia/internal/config"
	"github.com/MKolega/AirsoftHubCroatia/types"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	_ "github.com/uptrace/bun/driver/pgdriver"
	"github.com/uptrace/bun/extra/bundebug"
)

var Bun *bun.DB

func makePostgresURI(user, pass, host, port, dbname string) string {
	u := &url.URL{
		Scheme: "postgres",
		Host:   net.JoinHostPort(host, port),
		Path:   "/" + dbname,
	}
	if pass == "" {
		u.User = url.User(user)
	} else {
		u.User = url.UserPassword(user, pass)
	}
	q := u.Query()
	q.Set("sslmode", "disable")
	u.RawQuery = q.Encode()
	return u.String()
}

func CreateDatabase() (*sql.DB, error) {
	_ = godotenv.Load()

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	var dbname, dbuser, dbpass, dbhost, dbport string

	if databaseURL != "" {
		parsed, err := url.Parse(databaseURL)
		if err != nil {
			return nil, fmt.Errorf("failed to parse DATABASE_URL: %v", err)
		}
		if parsed.User != nil {
			dbuser = parsed.User.Username()
			dbpass, _ = parsed.User.Password()
		}
		host, port, err := net.SplitHostPort(parsed.Host)
		if err != nil {

			host = parsed.Host
			port = ""
		}
		dbhost = host
		dbport = port
		dbname = strings.TrimPrefix(parsed.Path, "/")

	}

	// fallback to defaults
	if dbname == "" {
		dbname = config.GetEnv("DB_NAME", "airsoftdb")
	}
	if dbuser == "" {
		dbuser = config.GetEnv("DB_USER", "postgres")
	}
	if dbpass == "" {
		dbpass = config.GetEnv("DB_PASS", "")
	}
	if dbhost == "" {
		dbhost = config.GetEnv("DB_HOST", "localhost")
	}
	if dbport == "" {
		dbport = config.GetEnv("DB_PORT", "5431")
	}

	// connect to the server's admin DB
	adminURI := makePostgresURI(dbuser, dbpass, dbhost, dbport, "postgres")
	adminDB, err := sql.Open("postgres", adminURI)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to admin database: %v", err)
	}
	defer adminDB.Close()

	if err := adminDB.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping admin database: %v", err)
	}

	var exists bool
	err = adminDB.QueryRow("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)", dbname).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to check database existence: %v", err)
	}

	if !exists {
		// Create database
		createQuery := fmt.Sprintf(`CREATE DATABASE "%s"`, dbname)
		if _, err := adminDB.Exec(createQuery); err != nil {
			return nil, fmt.Errorf("failed to create database %s: %v", dbname, err)
		}
	}

	// connect to the target database
	targetURI := makePostgresURI(dbuser, dbpass, dbhost, dbport, dbname)
	db, err := sql.Open("postgres", targetURI)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to target database: %v", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping target database: %v", err)
	}

	return db, nil
}

func Init() error {
	db, err := CreateDatabase()
	if err != nil {
		return err
	}
	Bun = bun.NewDB(db, pgdialect.New())
	if dbDebugEnabled() {
		Bun.AddQueryHook(bundebug.NewQueryHook())
	}

	err = CreateUsersTable()
	if err != nil {
		return err
	}
	if err := PromoteAdminsFromEnv(); err != nil {
		return err
	}
	if err := PromoteMaintenanceUsersFromEnv(); err != nil {
		return err
	}

	err = CreateSavedEventsTable()
	if err != nil {
		return err
	}

	err = CreateEventsTable()
	if err != nil {
		return err
	}
	err = SeedEventsTable()
	if err != nil {
		return err
	}
	return nil
}

func dbDebugEnabled() bool {
	v := strings.TrimSpace(config.GetEnv("DB_DEBUG", "false"))
	if v == "" {
		return false
	}
	switch strings.ToLower(v) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func CreateEventsTable() error {
	query := `CREATE TABLE IF NOT EXISTS events (
			id SERIAL PRIMARY KEY,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			status TEXT NOT NULL DEFAULT 'approved',
			rejection_reason TEXT,
			reviewed_at TIMESTAMPTZ,
			reviewed_by_email TEXT,
			name TEXT NOT NULL,
			description TEXT,
			detailed_description TEXT,
			creator_email TEXT,
			lat DOUBLE PRECISION,
			lng DOUBLE PRECISION,
			location TEXT,
			date DATE,
			category TEXT DEFAULT 'Skirmish',
			facebook_link TEXT,
			thumbnail TEXT
		);`
	_, err := Bun.ExecContext(context.Background(), query)
	if err != nil {
		return err
	}

	// Ensure columns exist for older databases.
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT;`); err != nil {
		return err
	}
	// Default and backfill for older rows.
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ALTER COLUMN category SET DEFAULT 'Skirmish';`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `UPDATE events SET category='Skirmish' WHERE category IS NULL OR category='';`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS facebook_link TEXT;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS detailed_description TEXT;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS creator_email TEXT;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ALTER COLUMN created_at SET DEFAULT now();`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `UPDATE events SET created_at=now() WHERE created_at IS NULL;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ALTER COLUMN created_at SET NOT NULL;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS thumbnail TEXT;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ALTER COLUMN status SET DEFAULT 'approved';`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `UPDATE events SET status='approved' WHERE status IS NULL OR status='';`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ALTER COLUMN status SET NOT NULL;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS rejection_reason TEXT;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE events ADD COLUMN IF NOT EXISTS reviewed_by_email TEXT;`); err != nil {
		return err
	}
	return nil
}

func CountEventsByCreatorInRange(creatorEmail string, start time.Time, end time.Time) (int, error) {
	return Bun.NewSelect().
		Model((*types.Event)(nil)).
		Where("creator_email = ?", creatorEmail).
		Where("created_at >= ? AND created_at < ?", start, end).
		Count(context.Background())
}

func GetEventsFromDB() ([]types.Event, error) {
	var events []types.Event
	err := Bun.NewSelect().Model(&events).Where("status = ?", "approved").Order("date").Scan(context.Background())
	if err != nil {
		return nil, err
	}
	return events, nil
}

func GetPendingEventsFromDB() ([]types.Event, error) {
	var events []types.Event
	err := Bun.NewSelect().Model(&events).Where("status = ?", "pending").Order("created_at").Scan(context.Background())
	if err != nil {
		return nil, err
	}
	return events, nil
}

func GetEventsByCreatorEmailAllStatuses(creatorEmail string) ([]types.Event, error) {
	var events []types.Event
	err := Bun.NewSelect().
		Model(&events).
		Where("creator_email = ?", strings.TrimSpace(creatorEmail)).
		Order("created_at DESC").
		Scan(context.Background())
	if err != nil {
		return nil, err
	}
	return events, nil
}

func ReviewEvent(eventID int, status string, reviewedByEmail string, rejectionReason *string) error {
	st := strings.TrimSpace(status)
	if st == "" {
		return fmt.Errorf("status is required")
	}
	if st != "pending" && st != "approved" && st != "rejected" {
		return fmt.Errorf("invalid status")
	}

	var reason any
	if rejectionReason != nil {
		r := strings.TrimSpace(*rejectionReason)
		if r != "" {
			reason = r
		}
	}

	adminEmail := strings.TrimSpace(reviewedByEmail)

	_, err := Bun.NewUpdate().
		Model((*types.Event)(nil)).
		Set("status = ?", st).
		Set("rejection_reason = ?", reason).
		Set("reviewed_at = now()").
		Set("reviewed_by_email = ?", adminEmail).
		Where("id = ?", eventID).
		Exec(context.Background())
	return err
}

func SeedEventsTable() error {
	count, err := Bun.NewSelect().Model((*types.Event)(nil)).Count(context.Background())
	if err != nil {
		return err
	}
	if count > 0 {
		// Table already seeded
		return nil
	}
	events := []types.Event{
		{Status: "approved", Name: "Event 1", Description: "Desc 1", DetailedDescription: "More details for Event 1", Location: "Croatia", Lat: 45.0, Lng: 16.0, Date: "2024-07-01", Category: "Skirmish", FacebookLink: "https://www.facebook.com/events/792766179793560"},
		{Status: "approved", Name: "Event 2", Description: "Desc 2", DetailedDescription: "More details for Event 2", Location: "Croatia", Lat: 46.0, Lng: 17.0, Date: "2024-07-15", Category: "Skirmish", FacebookLink: "https://www.facebook.com/events/2075916069838446"},
	}
	_, err = Bun.NewInsert().Model(&events).Exec(context.Background())
	return err
}

func InsertEventToDB(event *types.Event) error {
	_, err := Bun.NewInsert().Model(event).Exec(context.Background())
	return err
}

func UpdateEventInDB(id string, event *types.Event) error {
	_, err := Bun.NewUpdate().Model(event).Where("id = ?", id).Exec(context.Background())
	return err
}

func UpdateEventInDBColumns(id string, event *types.Event, columns ...string) error {
	q := Bun.NewUpdate().Model(event)
	if len(columns) > 0 {
		q = q.Column(columns...)
	}
	_, err := q.Where("id = ?", id).Exec(context.Background())
	return err
}

func DeleteEventFromDB(id string) error {
	_, err := Bun.NewDelete().Model((*types.Event)(nil)).Where("id = ?", id).Exec(context.Background())
	return err
}
