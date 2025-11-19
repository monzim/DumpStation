package utils

import (
	"fmt"
	"math/rand"
	"time"
)

// Word lists for generating human-readable names
var (
	adjectives = []string{
		"swift", "bright", "calm", "eager", "gentle",
		"happy", "jolly", "kind", "lively", "merry",
		"noble", "proud", "quiet", "rapid", "serene",
		"brave", "clever", "daring", "wise", "mighty",
		"golden", "silver", "crystal", "stellar", "cosmic",
		"arctic", "tropical", "mystic", "sacred", "ancient",
		"modern", "future", "quantum", "digital", "electric",
		"thunder", "lightning", "storm", "cloud", "wind",
		"ocean", "mountain", "forest", "river", "desert",
	}

	nouns = []string{
		"falcon", "eagle", "hawk", "raven", "phoenix",
		"tiger", "lion", "bear", "wolf", "fox",
		"dragon", "unicorn", "griffin", "pegasus", "kraken",
		"atlas", "titan", "Neptune", "mercury", "venus",
		"comet", "meteor", "nova", "quasar", "pulsar",
		"glacier", "volcano", "canyon", "summit", "valley",
		"willow", "cedar", "maple", "oak", "pine",
		"sapphire", "ruby", "emerald", "diamond", "opal",
		"shield", "sword", "arrow", "lance", "hammer",
		"beacon", "fortress", "castle", "tower", "citadel",
	}
)

// GenerateBackupName generates a human-readable name for a backup
// Format: "adjective-noun-timestamp"
// Example: "swift-falcon-20251119", "brave-dragon-20251119"
func GenerateBackupName() string {
	// Seed the random number generator
	rand.Seed(time.Now().UnixNano())

	// Select random adjective and noun
	adjective := adjectives[rand.Intn(len(adjectives))]
	noun := nouns[rand.Intn(len(nouns))]

	// Format timestamp as YYYYMMDD
	timestamp := time.Now().Format("20060102")

	// Combine into human-readable name
	return fmt.Sprintf("%s-%s-%s", adjective, noun, timestamp)
}

// GenerateBackupNameWithSuffix generates a human-readable name with custom suffix
// Example: "swift-falcon-001", "brave-dragon-backup"
func GenerateBackupNameWithSuffix(suffix string) string {
	rand.Seed(time.Now().UnixNano())
	adjective := adjectives[rand.Intn(len(adjectives))]
	noun := nouns[rand.Intn(len(nouns))]
	return fmt.Sprintf("%s-%s-%s", adjective, noun, suffix)
}
