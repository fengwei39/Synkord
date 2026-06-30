package services

import (
	"errors"
	"time"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

type TeamWithRole struct {
	models.Team
	Role models.TeamRole `json:"role"`
}

type TeamMemberView struct {
	ID           string                  `json:"id"`
	TeamID       string                  `json:"team_id"`
	UserID       string                  `json:"user_id"`
	Username     string                  `json:"username"`
	Email        string                  `json:"email"`
	Role         models.TeamRole         `json:"role"`
	Status       models.TeamMemberStatus `json:"status"`
	InviteStatus models.InviteStatus     `json:"invite_status"`
	Remark       string                  `json:"remark"`
	JoinedAt     string                  `json:"joined_at"`
	LastActiveAt *string                 `json:"last_active_at"`
}

type TeamMemberInput struct {
	Username string                  `json:"username"`
	Email    string                  `json:"email"`
	Password string                  `json:"password"`
	Role     models.TeamRole         `json:"role"`
	Status   models.TeamMemberStatus `json:"status"`
	Remark   string                  `json:"remark"`
}

func CreateTeam(db *gorm.DB, ownerID, name, description string) (*TeamWithRole, error) {
	if name == "" {
		return nil, errors.New("team name is required")
	}

	team := &models.Team{
		Name:        name,
		Description: description,
		OwnerID:     ownerID,
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(team).Error; err != nil {
			return err
		}
		member := &models.TeamMember{
			TeamID:       team.ID,
			UserID:       ownerID,
			Role:         models.TeamRoleAdmin,
			Status:       models.TeamMemberActive,
			InviteStatus: models.InviteAccepted,
		}
		return tx.Create(member).Error
	})
	if err != nil {
		return nil, err
	}

	return &TeamWithRole{Team: *team, Role: models.TeamRoleAdmin}, nil
}

func ListUserTeams(db *gorm.DB, userID string) ([]TeamWithRole, error) {
	var memberships []models.TeamMember
	if err := db.Preload("Team").Where("user_id = ? AND status = ?", userID, models.TeamMemberActive).Order("created_at").Find(&memberships).Error; err != nil {
		return nil, err
	}

	out := make([]TeamWithRole, 0, len(memberships))
	for _, membership := range memberships {
		if membership.Team == nil {
			continue
		}
		out = append(out, TeamWithRole{Team: *membership.Team, Role: membership.Role})
	}
	return out, nil
}

func GetTeamForUser(db *gorm.DB, teamID, userID string) (*TeamWithRole, error) {
	var membership models.TeamMember
	if err := db.Preload("Team").Where("team_id = ? AND user_id = ? AND status = ?", teamID, userID, models.TeamMemberActive).First(&membership).Error; err != nil {
		return nil, err
	}
	if membership.Team == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return &TeamWithRole{Team: *membership.Team, Role: membership.Role}, nil
}

func ListTeamMembers(db *gorm.DB, teamID string) ([]TeamMemberView, error) {
	var members []models.TeamMember
	if err := db.Preload("User").Where("team_id = ?", teamID).Order("created_at").Find(&members).Error; err != nil {
		return nil, err
	}

	out := make([]TeamMemberView, 0, len(members))
	for _, member := range members {
		username := ""
		email := ""
		if member.User != nil {
			username = member.User.Username
			email = member.User.Email
		}
		view := TeamMemberView{
			ID:           member.ID,
			TeamID:       member.TeamID,
			UserID:       member.UserID,
			Username:     username,
			Email:        email,
			Role:         member.Role,
			Status:       member.Status,
			InviteStatus: member.InviteStatus,
			Remark:       member.Remark,
			JoinedAt:     member.JoinedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
		if member.LastActiveAt != nil {
			lastActiveAt := member.LastActiveAt.Format("2006-01-02T15:04:05Z07:00")
			view.LastActiveAt = &lastActiveAt
		}
		out = append(out, view)
	}
	return out, nil
}

func CreateTeamMember(db *gorm.DB, teamID string, input TeamMemberInput) (*TeamMemberView, error) {
	if input.Username == "" {
		return nil, errors.New("username is required")
	}
	if input.Password == "" {
		return nil, errors.New("password is required")
	}
	if input.Role == "" {
		input.Role = models.TeamRoleViewer
	}
	if input.Status == "" {
		input.Status = models.TeamMemberActive
	}

	var created models.TeamMember
	err := db.Transaction(func(tx *gorm.DB) error {
		user, err := CreateUserWithEmail(tx, input.Username, input.Email, input.Password, string(models.RoleViewer))
		if err != nil {
			return err
		}
		created = models.TeamMember{
			TeamID:       teamID,
			UserID:       user.ID,
			Role:         input.Role,
			Status:       input.Status,
			InviteStatus: models.InviteAccepted,
			Remark:       input.Remark,
		}
		return tx.Create(&created).Error
	})
	if err != nil {
		return nil, err
	}
	members, err := ListTeamMembers(db, teamID)
	if err != nil {
		return nil, err
	}
	for _, member := range members {
		if member.ID == created.ID {
			return &member, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func UpdateTeamMember(db *gorm.DB, teamID, memberID string, input TeamMemberInput) (*TeamMemberView, error) {
	var member models.TeamMember
	if err := db.Preload("User").First(&member, "id = ? AND team_id = ?", memberID, teamID).Error; err != nil {
		return nil, err
	}

	nextRole := input.Role
	if nextRole == "" {
		nextRole = member.Role
	}
	nextStatus := input.Status
	if nextStatus == "" {
		nextStatus = member.Status
	}
	if err := ensureNotRemovingLastTeamAdmin(db, teamID, member.ID, nextRole, nextStatus); err != nil {
		return nil, err
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		updates := map[string]interface{}{
			"role":   nextRole,
			"status": nextStatus,
			"remark": input.Remark,
		}
		if err := tx.Model(&member).Updates(updates).Error; err != nil {
			return err
		}
		if member.User != nil {
			userUpdates := map[string]interface{}{}
			if input.Username != "" {
				userUpdates["username"] = input.Username
			}
			userUpdates["email"] = input.Email
			if len(userUpdates) > 0 {
				if err := tx.Model(member.User).Updates(userUpdates).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	members, err := ListTeamMembers(db, teamID)
	if err != nil {
		return nil, err
	}
	for _, item := range members {
		if item.ID == memberID {
			return &item, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func DeleteTeamMembers(db *gorm.DB, teamID string, memberIDs []string) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for _, memberID := range memberIDs {
			var member models.TeamMember
			if err := tx.First(&member, "id = ? AND team_id = ?", memberID, teamID).Error; err != nil {
				return err
			}
			if err := ensureNotRemovingLastTeamAdmin(tx, teamID, member.ID, models.TeamRoleViewer, models.TeamMemberDisabled); err != nil {
				return err
			}
			if err := tx.Delete(&member).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func ensureNotRemovingLastTeamAdmin(db *gorm.DB, teamID, memberID string, nextRole models.TeamRole, nextStatus models.TeamMemberStatus) error {
	var member models.TeamMember
	if err := db.First(&member, "id = ? AND team_id = ?", memberID, teamID).Error; err != nil {
		return err
	}
	if member.Role != models.TeamRoleAdmin || member.Status != models.TeamMemberActive {
		return nil
	}
	if nextRole == models.TeamRoleAdmin && nextStatus == models.TeamMemberActive {
		return nil
	}
	var count int64
	if err := db.Model(&models.TeamMember{}).
		Where("team_id = ? AND role = ? AND status = ? AND id <> ?", teamID, models.TeamRoleAdmin, models.TeamMemberActive, memberID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("cannot remove the last active team admin")
	}
	return nil
}

func TouchTeamMemberActiveAt(db *gorm.DB, teamID, userID string) error {
	now := time.Now()
	return db.Model(&models.TeamMember{}).
		Where("team_id = ? AND user_id = ?", teamID, userID).
		Update("last_active_at", &now).Error
}
