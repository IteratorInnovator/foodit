package database

import (
	"crypto/tls"
	"log"
	"strings"
	"time"

	"github.com/aws/aws-sigv4-auth-cassandra-gocql-driver-plugin/sigv4"
	"github.com/gocql/gocql"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/config"
)

type CassandraDB struct {
	Session *gocql.Session
}

func NewCassandraDB(cfg *config.Config) (*CassandraDB, error) {
	hosts := strings.Split(cfg.CassandraHosts, ",")
	cluster := gocql.NewCluster(hosts...)
	cluster.Keyspace = cfg.CassandraKeyspace
	cluster.Port = cfg.CassandraPort
	cluster.Timeout = 30 * time.Second
	cluster.ConnectTimeout = 30 * time.Second
	cluster.Consistency = gocql.LocalQuorum

	// Disable initial host lookup to prevent peer IP discovery issues
	cluster.DisableInitialHostLookup = true

	// TLS configuration for AWS Keyspaces
	cluster.SslOpts = &gocql.SslOptions{
		EnableHostVerification: false,
		Config: &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: true,
		},
	}

	// SigV4 authentication using the default AWS credential provider chain.
	// On EKS with IRSA, the SDK automatically picks up the web identity token
	// from the service account (via AWS_ROLE_ARN and AWS_WEB_IDENTITY_TOKEN_FILE).
	auth := sigv4.NewAwsAuthenticator()
	auth.Region = cfg.AWSRegion
	if cfg.AWSAccessKeyID != "" && cfg.AWSSecretAccessKey != "" {
		auth.AccessKeyId = cfg.AWSAccessKeyID
		auth.SecretAccessKey = cfg.AWSSecretAccessKey
	}
	cluster.Authenticator = auth

	// Connection pool settings
	cluster.PoolConfig.HostSelectionPolicy = gocql.RoundRobinHostPolicy()
	cluster.RetryPolicy = &gocql.ExponentialBackoffRetryPolicy{
		NumRetries: 3,
		Min:        100 * time.Millisecond,
		Max:        2 * time.Second,
	}

	log.Printf("Connecting to AWS Keyspaces in region %s", cfg.AWSRegion)

	session, err := cluster.CreateSession()
	if err != nil {
		return nil, err
	}

	log.Println("Successfully connected to AWS Keyspaces")

	db := &CassandraDB{Session: session}
	if err := db.initSchema(); err != nil {
		session.Close()
		return nil, err
	}

	return db, nil
}

func (db *CassandraDB) initSchema() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS chat_rooms (
			chat_room_id UUID,
			order_id UUID,
			buyer_id UUID,
			runner_id UUID,
			status TEXT,
			created_at TIMESTAMP,
			closed_at TIMESTAMP,
			PRIMARY KEY (chat_room_id)
		)`,

		`CREATE TABLE IF NOT EXISTS messages (
			chat_room_id UUID,
			message_id TIMEUUID,
			sender_id UUID,
			content TEXT,
			sent_at TIMESTAMP,
			PRIMARY KEY ((chat_room_id), message_id)
		) WITH CLUSTERING ORDER BY (message_id DESC)`,

		`CREATE TABLE IF NOT EXISTS chat_rooms_by_user (
			user_id UUID,
			chat_room_id UUID,
			created_at TIMESTAMP,
			order_id UUID,
			status TEXT,
			PRIMARY KEY ((user_id), chat_room_id, created_at)
		) WITH CLUSTERING ORDER BY (chat_room_id ASC, created_at DESC)`,
	}

	for _, query := range queries {
		if err := db.Session.Query(query).Exec(); err != nil {
			return err
		}
	}

	log.Println("Schema initialized successfully")
	return nil
}

func (db *CassandraDB) Close() {
	if db.Session != nil {
		db.Session.Close()
	}
}
