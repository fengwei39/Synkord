// Synkord Contract Set service
// 契约集 CRUD + 成员管理 + 权限校验
// 详见 docs/requirements.md §四

package services

import (
	"errors"
	"fmt"
	"strings"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

// ============================================================================
// Contract Set CRUD
// ============================================================================

// ListUserContracts 列出当前用户有权限访问的所有契约集（带 my_role + 统计）
func ListUserContracts(db *gorm.DB, userID string) ([]models.ContractSet, error) {
	// 单 SQL JOIN 出 my_role + 3 个 count
	type contractWithCounts struct {
		models.ContractSet
		MyRole      models.ContractSetRole `gorm:"column:my_role"`
		MemberCount int64                  `gorm:"column:member_count"`
		APICount    int64                  `gorm:"column:api_count"`
		EntityCount int64                  `gorm:"column:entity_count"`
	}

	var rows []contractWithCounts
	err := db.Raw(`
		SELECT
		  cs.*,
		  cm.role AS my_role,
		  (SELECT COUNT(*) FROM contract_members WHERE contract_id = cs.id) AS member_count,
		  (SELECT COUNT(*) FROM api_endpoints WHERE contract_id = cs.id) AS api_count,
		  (SELECT COUNT(*) FROM entities WHERE contract_id = cs.id) AS entity_count
		FROM contract_sets cs
		INNER JOIN contract_members cm ON cm.contract_id = cs.id
		WHERE cm.user_id = ? AND cs.deleted_at IS NULL
		ORDER BY cs.updated_at DESC
	`, userID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	contracts := make([]models.ContractSet, 0, len(rows))
	for _, r := range rows {
		r.ContractSet.MyRole = r.MyRole
		contracts = append(contracts, r.ContractSet)
	}

	return contracts, nil
}

// ContractWithCounts 列表返回（带 my_role + 计数）
type ContractWithCounts struct {
	models.ContractSet
	MemberCount int64 `json:"member_count"`
	APICount    int64 `json:"api_count"`
	EntityCount int64 `json:"entity_count"`
}

// ListUserContractsWithCounts 列出契约集 + 计数
func ListUserContractsWithCounts(db *gorm.DB, userID string) ([]ContractWithCounts, error) {
	type contractWithCounts struct {
		models.ContractSet
		MyRole      models.ContractSetRole `gorm:"column:my_role"`
		MemberCount int64                  `gorm:"column:member_count"`
		APICount    int64                  `gorm:"column:api_count"`
		EntityCount int64                  `gorm:"column:entity_count"`
	}

	var rows []contractWithCounts
	err := db.Raw(`
		SELECT
		  cs.*,
		  cm.role AS my_role,
		  (SELECT COUNT(*) FROM contract_members WHERE contract_id = cs.id) AS member_count,
		  (SELECT COUNT(*) FROM api_endpoints WHERE contract_id = cs.id) AS api_count,
		  (SELECT COUNT(*) FROM entities WHERE contract_id = cs.id) AS entity_count
		FROM contract_sets cs
		INNER JOIN contract_members cm ON cm.contract_id = cs.id
		WHERE cm.user_id = ? AND cs.deleted_at IS NULL
		ORDER BY cs.updated_at DESC
	`, userID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	result := make([]ContractWithCounts, 0, len(rows))
	for _, r := range rows {
		r.ContractSet.MyRole = r.MyRole
		result = append(result, ContractWithCounts{
			ContractSet: r.ContractSet,
			MemberCount: r.MemberCount,
			APICount:    r.APICount,
			EntityCount: r.EntityCount,
		})
	}
	return result, nil
}

// GetContractByID 按 ID 获取契约集
func GetContractByID(db *gorm.DB, contractID string) (*models.ContractSet, error) {
	var c models.ContractSet
	if err := db.First(&c, "id = ?", contractID).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

// GetContractForUser 获取契约集并校验当前用户有访问权限
func GetContractForUser(db *gorm.DB, contractID, userID string) (*models.ContractSet, models.ContractSetRole, error) {
	c, err := GetContractByID(db, contractID)
	if err != nil {
		return nil, "", err
	}
	role, err := getMemberRole(db, contractID, userID)
	if err != nil {
		return nil, "", errors.New("access denied")
	}
	return c, role, nil
}

// CreateContract 创建契约集（创建者自动成为 owner）
func CreateContract(db *gorm.DB, userID, name, description string) (*models.ContractSet, error) {
	name = strings.TrimSpace(name)
	if len(name) < 2 || len(name) > 128 {
		return nil, errors.New("name must be between 2 and 128 characters")
	}

	tx := db.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	c := &models.ContractSet{
		Name:        name,
		Description: description,
		CreatorID:   userID,
	}
	if err := tx.Create(c).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// 创建者自动加入为 owner
	member := &models.ContractMember{
		ContractID: c.ID,
		UserID:     userID,
		Role:       models.ContractRoleOwner,
	}
	if err := tx.Create(member).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}
	return c, nil
}

// UpdateContract 更新契约集（仅 owner）
func UpdateContract(db *gorm.DB, contractID, userID string, name, description *string, archived *bool) (*models.ContractSet, error) {
	role, err := getMemberRole(db, contractID, userID)
	if err != nil || role != models.ContractRoleOwner {
		return nil, errors.New("only owner can update contract")
	}

	c, err := GetContractByID(db, contractID)
	if err != nil {
		return nil, err
	}
	updates := map[string]interface{}{}
	if name != nil {
		n := strings.TrimSpace(*name)
		if len(n) < 2 || len(n) > 128 {
			return nil, errors.New("name must be between 2 and 128 characters")
		}
		updates["name"] = n
	}
	if description != nil {
		updates["description"] = *description
	}
	if archived != nil {
		updates["archived"] = *archived
	}
	if len(updates) == 0 {
		return c, nil
	}
	if err := db.Model(c).Updates(updates).Error; err != nil {
		return nil, err
	}
	return GetContractByID(db, contractID)
}

// ErrContractNotEmpty 契约集非空，禁止删除
var ErrContractNotEmpty = errors.New("contract is not empty: remove all APIs, data models and other members before deleting")

// ClearContractAPIs 清空契约集下所有接口（仅 owner / editor 可调用）
// 同时清理：dependencies（依赖图按 contract_id 全清，因为 Dependency 是按
// entity_name/api_path 软引用，没有外键关联）
// 返回删除的接口数
func ClearContractAPIs(db *gorm.DB, contractID, userID string) (int, error) {
	role, err := getMemberRole(db, contractID, userID)
	if err != nil || (role != models.ContractRoleOwner && role != models.ContractRoleEditor) {
		return 0, errors.New("editor or owner required")
	}

	tx := db.Begin()
	if tx.Error != nil {
		return 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 先清掉依赖图（按 contract_id 全清，依赖节点将全部失效）
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.Dependency{}).Error; err != nil {
		tx.Rollback()
		return 0, err
	}

	res := tx.Where("contract_id = ?", contractID).Delete(&models.APIEndpoint{})
	if res.Error != nil {
		tx.Rollback()
		return 0, res.Error
	}
	count := int(res.RowsAffected)

	if err := tx.Commit().Error; err != nil {
		return 0, err
	}
	return count, nil
}

// ClearContractEntities 清空契约集下所有数据模型（仅 owner / editor 可调用）
// 同时清理：依赖图、entity_versions
// 返回删除的实体数
func ClearContractEntities(db *gorm.DB, contractID, userID string) (int, error) {
	role, err := getMemberRole(db, contractID, userID)
	if err != nil || (role != models.ContractRoleOwner && role != models.ContractRoleEditor) {
		return 0, errors.New("editor or owner required")
	}

	tx := db.Begin()
	if tx.Error != nil {
		return 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 先取本契约集所有 entity id，用于清 entity_versions
	var entityIDs []string
	if err := tx.Model(&models.DataModel{}).
		Where("contract_id = ?", contractID).
		Pluck("id", &entityIDs).Error; err != nil {
		tx.Rollback()
		return 0, err
	}

	// 清依赖图（按 contract_id 全清）
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.Dependency{}).Error; err != nil {
		tx.Rollback()
		return 0, err
	}

	// 清 entity_versions（按 entity_id 子查询）
	if len(entityIDs) > 0 {
		if err := tx.Where("entity_id IN ?", entityIDs).
			Delete(&models.DataModelVersion{}).Error; err != nil {
			tx.Rollback()
		}
	}

	// 清实体本体
	res := tx.Where("contract_id = ?", contractID).Delete(&models.DataModel{})
	if res.Error != nil {
		tx.Rollback()
		return 0, res.Error
	}
	count := int(res.RowsAffected)

	if err := tx.Commit().Error; err != nil {
		return 0, err
	}
	return count, nil
}

// DeleteContract 删除契约集（级联删除所有内容，仅 owner）
//
// 前置条件：契约集必须为空
//   - api_count == 0
//   - entity_count == 0
//   - member_count == 1（仅创建者本人）
//
// 满足全部条件后才执行级联删除。
func DeleteContract(db *gorm.DB, contractID, userID string) error {
	role, err := getMemberRole(db, contractID, userID)
	if err != nil || role != models.ContractRoleOwner {
		return errors.New("only owner can delete contract")
	}

	// 前置条件：必须为空（含成员只有创建者）
	var apiCount, entityCount, memberCount int64
	if err := db.Model(&models.APIEndpoint{}).Where("contract_id = ?", contractID).Count(&apiCount).Error; err != nil {
		return err
	}
	if err := db.Model(&models.DataModel{}).Where("contract_id = ?", contractID).Count(&entityCount).Error; err != nil {
		return err
	}
	if err := db.Model(&models.ContractMember{}).Where("contract_id = ?", contractID).Count(&memberCount).Error; err != nil {
		return err
	}
	if apiCount > 0 || entityCount > 0 || memberCount > 1 {
		return ErrContractNotEmpty
	}

	tx := db.Begin()
	if tx.Error != nil {
		return tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 级联删除
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.APIEndpoint{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.DataModel{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.SwaggerSpec{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.MCPAuditLog{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.ContractMember{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.Dependency{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	// entity_versions 没有 contract_id 列，要先找属于本契约集的 entity id 集合
	if err := tx.Exec(
		`DELETE FROM entity_versions WHERE entity_id IN (SELECT id FROM entities WHERE contract_id = ?)`,
		contractID,
	).Error; err != nil {
		tx.Rollback()
		return err
	}
	// 清理活跃契约集指针（避免孤儿引用已删除 contract_id）
	if err := tx.Where("contract_id = ?", contractID).Delete(&models.ActiveContract{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Delete(&models.ContractSet{}, "id = ?", contractID).Error; err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

// ============================================================================
// 成员管理
// ============================================================================

// ListContractMembers 列出契约集的所有成员（含 username）
func ListContractMembers(db *gorm.DB, contractID string) ([]models.ContractMember, error) {
	// 使用自定义结构接收 JOIN 出来的 username
	type memberRow struct {
		models.ContractMember
		Username string `gorm:"column:username"`
	}
	var rows []memberRow
	err := db.Raw(`
		SELECT cm.id, cm.contract_id, cm.user_id, cm.role,
		       cm.invited_at, cm.accepted_at, cm.created_at, cm.updated_at,
		       u.username
		FROM contract_members cm
		INNER JOIN users u ON u.id = cm.user_id
		WHERE cm.contract_id = ?
		ORDER BY cm.created_at ASC
	`, contractID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	members := make([]models.ContractMember, 0, len(rows))
	for _, r := range rows {
		r.ContractMember.Username = r.Username
		members = append(members, r.ContractMember)
	}
	return members, nil
}

// AddContractMember 添加成员（仅 owner）
func AddContractMember(db *gorm.DB, contractID, actingUserID, targetUserID string, role models.ContractSetRole) (*models.ContractMember, error) {
	// 权限校验：仅 owner 可邀请
	actingRole, err := getMemberRole(db, contractID, actingUserID)
	if err != nil {
		return nil, err
	}
	if actingRole != models.ContractRoleOwner {
		return nil, errors.New("only owner can add members")
	}
	// 角色校验：不能直接邀请为 owner
	if role == models.ContractRoleOwner {
		return nil, errors.New("cannot invite as owner; only one owner per contract")
	}
	// 检查目标用户存在
	var u models.User
	if err := db.First(&u, "id = ?", targetUserID).Error; err != nil {
		return nil, errors.New("target user not found")
	}
	// 检查是否已是成员
	var existing models.ContractMember
	if err := db.Where("contract_id = ? AND user_id = ?", contractID, targetUserID).First(&existing).Error; err == nil {
		return nil, errors.New("user is already a member")
	}
	m := &models.ContractMember{
		ContractID: contractID,
		UserID:     targetUserID,
		Role:       role,
	}
	if err := db.Create(m).Error; err != nil {
		return nil, err
	}
	// 关联 username 用于返回
	m.User = &u
	return m, nil
}

// UpdateContractMemberRole 修改成员角色（仅 owner；创建者不可被降级）
func UpdateContractMemberRole(db *gorm.DB, contractID, actingUserID, targetUserID string, newRole models.ContractSetRole) (*models.ContractMember, error) {
	actingRole, err := getMemberRole(db, contractID, actingUserID)
	if err != nil {
		return nil, err
	}
	if actingRole != models.ContractRoleOwner {
		return nil, errors.New("only owner can change member roles")
	}
	// 硬约束：创建者不可被降级
	var c models.ContractSet
	if err := db.First(&c, "id = ?", contractID).Error; err != nil {
		return nil, err
	}
	if c.CreatorID == targetUserID && newRole != models.ContractRoleOwner {
		return nil, errors.New("creator role cannot be downgraded")
	}
	// 角色校验：仅允许 viewer/editor；owner 角色只能由创建者自己持有
	if newRole != models.ContractRoleViewer && newRole != models.ContractRoleEditor && newRole != models.ContractRoleOwner {
		return nil, errors.New("invalid role")
	}
	var m models.ContractMember
	if err := db.Where("contract_id = ? AND user_id = ?", contractID, targetUserID).First(&m).Error; err != nil {
		return nil, errors.New("member not found")
	}
	m.Role = newRole
	if err := db.Save(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

// RemoveContractMember 移除成员（仅 owner；创建者不可被移除）
func RemoveContractMember(db *gorm.DB, contractID, actingUserID, targetUserID string) error {
	actingRole, err := getMemberRole(db, contractID, actingUserID)
	if err != nil {
		return err
	}
	if actingRole != models.ContractRoleOwner {
		return errors.New("only owner can remove members")
	}
	var c models.ContractSet
	if err := db.First(&c, "id = ?", contractID).Error; err != nil {
		return err
	}
	if c.CreatorID == targetUserID {
		return errors.New("creator cannot be removed")
	}
	return db.Where("contract_id = ? AND user_id = ?", contractID, targetUserID).Delete(&models.ContractMember{}).Error
}

// ContractWithMeta 契约集 + 元信息（用于列表返回）
type ContractWithMeta struct {
	models.ContractSet
	MemberCount int64 `json:"member_count"`
	APICount    int64 `json:"api_count"`
	EntityCount int64 `json:"entity_count"`
}

// SearchUsersForInvite 搜索可邀请的用户（排除已是成员的）
func SearchUsersForInvite(db *gorm.DB, contractID, query string, limit int) ([]models.User, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	q := strings.TrimSpace(query)
	if len(q) < 1 {
		return nil, nil
	}
	var users []models.User
	err := db.Raw(`
		SELECT u.* FROM users u
		WHERE u.username LIKE ?
		  AND u.id NOT IN (
		    SELECT cm.user_id FROM contract_members cm
		    WHERE cm.contract_id = ?
		  )
		LIMIT ?
	`, "%"+q+"%", contractID, limit).Scan(&users).Error
	return users, err
}

// ============================================================================
// 权限校验辅助
// ============================================================================

// getMemberRole 获取用户在契约集中的角色（不存在则返回 error）
func getMemberRole(db *gorm.DB, contractID, userID string) (models.ContractSetRole, error) {
	var m models.ContractMember
	if err := db.Where("contract_id = ? AND user_id = ?", contractID, userID).First(&m).Error; err != nil {
		return "", err
	}
	return m.Role, nil
}

// HasContractRole 检查用户是否有指定角色或更高（owner > editor > viewer）
func HasContractRole(db *gorm.DB, contractID, userID string, minRole models.ContractSetRole) (bool, error) {
	role, err := getMemberRole(db, contractID, userID)
	if err != nil {
		return false, nil
	}
	switch minRole {
	case models.ContractRoleViewer:
		return true, nil
	case models.ContractRoleEditor:
		return role == models.ContractRoleOwner || role == models.ContractRoleEditor, nil
	case models.ContractRoleOwner:
		return role == models.ContractRoleOwner, nil
	}
	return false, fmt.Errorf("invalid min role: %s", minRole)
}