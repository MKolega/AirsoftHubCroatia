package db

import (
	"context"
	"errors"
	"strings"

	"github.com/MKolega/AirsoftHubCroatia/internal/config"
	"github.com/MKolega/AirsoftHubCroatia/types"
)

var ErrUserNotFound = errors.New("user not found")

func CreateUsersTable() error {
	query := `CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			email TEXT UNIQUE NOT NULL,
			username TEXT,
			airsoft_club TEXT,
			is_admin BOOLEAN NOT NULL DEFAULT false,
			password_hash TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);`
	if _, err := Bun.ExecContext(context.Background(), query); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE users ADD COLUMN IF NOT EXISTS airsoft_club TEXT;`); err != nil {
		return err
	}
	if _, err := Bun.ExecContext(context.Background(), `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;`); err != nil {
		return err
	}
	// Case-insensitive uniqueness for usernames (ignores empty usernames)
	if _, err := Bun.ExecContext(
		context.Background(),
		`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (lower(username)) WHERE username IS NOT NULL AND username <> '';`,
	); err != nil {
		return err
	}
	return nil
}

func UsernameTaken(username string, excludeUserID int) (bool, error) {
	uname := strings.ToLower(strings.TrimSpace(username))
	if uname == "" {
		return false, nil
	}
	count, err := Bun.NewSelect().
		Model((*types.User)(nil)).
		Where("lower(username) = ?", uname).
		Where("id <> ?", excludeUserID).
		Count(context.Background())
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func UpdateUserProfile(userID int, username string, airsoftClub string) error {
	uname := strings.TrimSpace(username)
	club := strings.TrimSpace(airsoftClub)
	_, err := Bun.NewUpdate().
		Model((*types.User)(nil)).
		Set("username = ?", uname).
		Set("airsoft_club = ?", club).
		Where("id = ?", userID).
		Exec(context.Background())
	return err
}

func PromoteAdminsFromEnv() error {
	raw := strings.TrimSpace(config.GetEnv("ADMIN_EMAILS", ""))
	if raw == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	for _, p := range parts {
		email := strings.ToLower(strings.TrimSpace(p))
		if email == "" {
			continue
		}
		if _, err := Bun.ExecContext(
			context.Background(),
			`UPDATE users SET is_admin=true WHERE lower(email)=?`,
			email,
		); err != nil {
			return err
		}
	}

	return nil
}

func GetUserByEmail(email string) (*types.User, error) {
	user := new(types.User)
	err := Bun.NewSelect().Model(user).Where("email = ?", email).Limit(1).Scan(context.Background())
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func InsertUser(user *types.User) error {
	_, err := Bun.NewInsert().Model(user).Exec(context.Background())
	return err
}
