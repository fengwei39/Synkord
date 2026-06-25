package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func SendDingTalkNotification(webhookURL, title, content string) error {
	payload := map[string]interface{}{
		"msgtype": "markdown",
		"markdown": map[string]string{
			"title": title,
			"text": fmt.Sprintf("## %s\n\n%s\n\n> 发送时间: %s\n> 来源: synkord-core",
				title, content, time.Now().Format("2006-01-02 15:04:05")),
		},
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("dingtalk returned status %d", resp.StatusCode)
	}
	return nil
}

func SendFeishuNotification(webhookURL, title, content string) error {
	payload := map[string]interface{}{
		"msg_type": "interactive",
		"card": map[string]interface{}{
			"header": map[string]interface{}{
				"title":    map[string]string{"tag": "plain_text", "content": title},
				"template": "red",
			},
			"elements": []map[string]interface{}{
				{"tag": "markdown", "content": content},
				{
					"tag": "note",
					"elements": []map[string]interface{}{
						{"tag": "plain_text", "content": fmt.Sprintf("synkord-core · %s", time.Now().Format("2006-01-02 15:04:05"))},
					},
				},
			},
		},
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("feishu returned status %d", resp.StatusCode)
	}
	return nil
}

func NotifyBreakingChange(dtURL, fsURL, serviceName, changedBy string, changes []BreakingChange, affectedProjects []string) map[string]bool {
	results := map[string]bool{"dingtalk": false, "feishu": false}

	title := fmt.Sprintf("⚠️ 破坏性变更: %s", serviceName)
	var changeLines []string
	for _, c := range changes {
		changeLines = append(changeLines,
			fmt.Sprintf("- **%s**: `%s` (旧: %s → 新: %s)", c.ChangeType, c.Path, c.OldValue, c.NewValue))
	}

	affected := "无"
	if len(affectedProjects) > 0 {
		affected = ""
		for _, p := range affectedProjects {
			affected += p + ", "
		}
		affected = affected[:len(affected)-2]
	}

	content := fmt.Sprintf("**变更人**: %s\n**服务**: %s\n**受影响项目**: %s\n\n**变更清单**:\n%s",
		changedBy, serviceName, affected, stringsJoin(changeLines, "\n"))

	if dtURL != "" {
		if err := SendDingTalkNotification(dtURL, title, content); err == nil {
			results["dingtalk"] = true
		}
	}
	if fsURL != "" {
		if err := SendFeishuNotification(fsURL, title, content); err == nil {
			results["feishu"] = true
		}
	}

	return results
}

func stringsJoin(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}
