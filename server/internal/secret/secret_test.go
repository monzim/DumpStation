package secret

import (
	"crypto/rand"
	"encoding/base64"
	"testing"

	"github.com/monzim/db_proxy/v1/internal/crypto"
)

func TestSealOpenRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	_, _ = rand.Read(key)
	c, err := crypto.NewCipher(base64.StdEncoding.EncodeToString(key))
	if err != nil {
		t.Fatal(err)
	}
	Configure(c)
	defer Configure(nil)

	sealed, err := Seal("hunter2")
	if err != nil {
		t.Fatal(err)
	}
	if !IsSealed(sealed) || sealed == "hunter2" {
		t.Fatalf("expected sealed value, got %q", sealed)
	}
	again, _ := Seal(sealed)
	if again != sealed {
		t.Fatal("Seal must be idempotent on sealed values")
	}
	pt, err := Open(sealed)
	if err != nil || pt != "hunter2" {
		t.Fatalf("Open = %q, %v", pt, err)
	}
	legacy, err := Open("plain-legacy")
	if err != nil || legacy != "plain-legacy" {
		t.Fatalf("legacy plaintext must pass through, got %q %v", legacy, err)
	}
	empty, _ := Seal("")
	if empty != "" {
		t.Fatal("empty string must stay empty")
	}
}
