package main

import (
	"encoding/json"
	"strings"
)

// mergeConfig 把 flag 值合并到基础 Config 上：
//   - server / token 缺省时回退到 env / cached
//   - team / project / format 总是用 flag 显式值
//
// 我们把 `*string` 拆出来是因为 flag.Parse 返回的是指针；用函数式合并
// 比让每个子命令各自判 nil 清晰。
func mergeConfig(server, token, team, project, format, note, username, password string) *Config {
	cfg := loadConfig()
	if server != "" {
		cfg.Server = server
	}
	if token != "" {
		cfg.Token = token
	}
	cfg.Team = team
	cfg.Project = project
	cfg.Format = format
	cfg.Note = note
	cfg.Username = username
	cfg.Password = password
	return cfg
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := parts[:0]
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func decodeJSON(body []byte, out any) error {
	if len(body) == 0 {
		return nil
	}
	return json.Unmarshal(body, out)
}
