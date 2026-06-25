package database

import (
	"os"
	"path/filepath"

	"github.com/synkord/core/config"
	"github.com/synkord/core/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init(cfg *config.Config) error {
	dir := filepath.Dir(cfg.DBPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	})
	if err != nil {
		return err
	}

	return DB.AutoMigrate(
		&models.Project{},
		&models.APIEndpoint{},
		&models.Entity{},
		&models.EntityVersion{},
		&models.Dependency{},
		&models.ChangeSet{},
		&models.User{},
	)
}
