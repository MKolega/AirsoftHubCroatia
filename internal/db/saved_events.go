package db

import (
	"context"
	"time"

	"github.com/MKolega/AirsoftHubCroatia/types"
	"github.com/uptrace/bun"
)

type eventSave struct {
	UserID    int       `bun:"user_id,pk"`
	EventID   int       `bun:"event_id,pk"`
	CreatedAt time.Time `bun:"created_at,notnull"`
}

func CreateSavedEventsTable() error {
	query := `CREATE TABLE IF NOT EXISTS event_saves (
			user_id INTEGER NOT NULL,
			event_id INTEGER NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			PRIMARY KEY(user_id, event_id)
		);`
	_, err := Bun.ExecContext(context.Background(), query)
	return err
}

func SaveEvent(userID int, eventID int) error {
	row := &eventSave{UserID: userID, EventID: eventID}
	_, err := Bun.NewInsert().
		Model(row).
		On("CONFLICT (user_id, event_id) DO NOTHING").
		Exec(context.Background())
	return err
}

func UnsaveEvent(userID int, eventID int) error {
	_, err := Bun.NewDelete().
		Model((*eventSave)(nil)).
		Where("user_id = ? AND event_id = ?", userID, eventID).
		Exec(context.Background())
	return err
}

func GetSavedEventIDsForUser(userID int) ([]int, error) {
	var ids []int
	err := Bun.NewSelect().
		Model((*eventSave)(nil)).
		Column("event_id").
		Where("user_id = ?", userID).
		Scan(context.Background(), &ids)
	if err != nil {
		return nil, err
	}
	return ids, nil
}

func GetSavedEventsForUser(userID int) ([]types.Event, error) {
	ids, err := GetSavedEventIDsForUser(userID)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []types.Event{}, nil
	}

	var events []types.Event
	err = Bun.NewSelect().
		Model(&events).
		Where("id IN (?)", bun.In(ids)).
		Order("date").
		Scan(context.Background())
	if err != nil {
		return nil, err
	}
	return events, nil
}
