package db

import (
	"context"
	"errors"

	"github.com/MKolega/AirsoftHubCroatia/types"
)

var ErrUserNotFound = errors.New("user not found")

func CreateUsersTable() error {
	query := `CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			email TEXT UNIQUE NOT NULL,
			username TEXT,
			airsoft_club TEXT,
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
