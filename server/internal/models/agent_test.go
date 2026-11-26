package models

import (
	"testing"

	"github.com/google/uuid"
)

func TestValidateConnection(t *testing.T) {
	aid := uuid.New()
	cases := []struct {
		name string
		in   DatabaseConfigInput
		pw   bool
		ok   bool
	}{
		{"direct complete", DatabaseConfigInput{Host: "h", Port: 5432, DBName: "d", Username: "u", Password: "p"}, true, true},
		{"direct missing password on create", DatabaseConfigInput{Host: "h", Port: 5432, DBName: "d", Username: "u"}, true, false},
		{"direct keeps password on update", DatabaseConfigInput{Host: "h", Port: 5432, DBName: "d", Username: "u"}, false, true},
		{"direct with agent fields", DatabaseConfigInput{Host: "h", Port: 5432, DBName: "d", Username: "u", Password: "p", AgentID: &aid}, true, false},
		{"agent local connection", DatabaseConfigInput{ExecutionMode: ExecutionAgent, AgentID: &aid, AgentConnection: "orders"}, true, true},
		{"agent without agent id", DatabaseConfigInput{ExecutionMode: ExecutionAgent, AgentConnection: "orders"}, true, false},
		{"agent central creds", DatabaseConfigInput{ExecutionMode: ExecutionAgent, AgentID: &aid, Host: "h", Port: 5432, DBName: "d", Username: "u", Password: "p"}, true, true},
	}
	for _, c := range cases {
		err := c.in.ValidateConnection(c.pw)
		if (err == nil) != c.ok {
			t.Errorf("%s: err=%v", c.name, err)
		}
	}
}

func TestUsesCentralCredentials(t *testing.T) {
	d := &DatabaseConfig{}
	if !d.UsesCentralCredentials() || d.Mode() != ExecutionDirect {
		t.Fatal("legacy rows are direct with central credentials")
	}
	d.ExecutionMode, d.AgentConnection = ExecutionAgent, "orders"
	if d.UsesCentralCredentials() {
		t.Fatal("agent-local connections keep credentials off the server")
	}
}
