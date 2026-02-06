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
			password_hash TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);`
	_, err := Bun.ExecContext(context.Background(), query)
	return err
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
