package models

// User represents the full DynamoDB user record including Stripe fields.
type User struct {
	UserID           string `dynamodbav:"user_id"`
	CreatedAt        string `dynamodbav:"created_at"`
	Email            string `dynamodbav:"email"`
	Name             string `dynamodbav:"name"`
	Picture          string `dynamodbav:"picture"`
	StripeCustomerID string `dynamodbav:"stripe_customer_id"`
	StripeConnectID  string `dynamodbav:"stripe_connect_id"`
}

// UserProfile represents the public-facing user data excluding Stripe fields.
type UserProfile struct {
	UserID    string `json:"user_id"`
	CreatedAt string `json:"created_at"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Picture   string `json:"picture"`
}

// ToProfile converts a User to a UserProfile, excluding Stripe fields.
func (u *User) ToProfile() *UserProfile {
	return &UserProfile{
		UserID:    u.UserID,
		CreatedAt: u.CreatedAt,
		Email:     u.Email,
		Name:      u.Name,
		Picture:   u.Picture,
	}
}
