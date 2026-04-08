package clients

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"gitlab.com/esd-g6-team1-tanzu/foodit-payment-management-service/internal/models"
)

// UserClient handles HTTP communication with User Service
type UserClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewUserClient creates a new User Service client with 5 second timeout
func NewUserClient(baseURL string) *UserClient {
	return &UserClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// GetStripeConnectID fetches the Stripe Connect ID for a runner
func (c *UserClient) GetStripeConnectID(runnerID string) (string, error) {
	resp, err := c.httpClient.Get(
		fmt.Sprintf("%s/api/users/%s/stripe/connect", c.baseURL, runnerID),
	)
	if err != nil {
		return "", fmt.Errorf("failed to fetch stripe connect id: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("runner not found: %s", runnerID)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("user service returned status %d", resp.StatusCode)
	}

	var respBody models.StripeConnectResponse
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if respBody.StripeConnectID == "" {
		return "", fmt.Errorf("runner %s has no stripe connect account", runnerID)
	}

	return respBody.StripeConnectID, nil
}

// GetStripeCustomerID fetches the Stripe Customer ID for a buyer
func (c *UserClient) GetStripeCustomerID(buyerID string) (string, error) {
	resp, err := c.httpClient.Get(
		fmt.Sprintf("%s/api/users/%s/stripe/customer", c.baseURL, buyerID),
	)
	if err != nil {
		return "", fmt.Errorf("failed to fetch stripe customer id: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("buyer not found: %s", buyerID)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("user service returned status %d", resp.StatusCode)
	}

	var respBody models.StripeCustomerResponse
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if respBody.StripeCustomerID == "" {
		return "", fmt.Errorf("buyer %s has no stripe customer account", buyerID)
	}

	return respBody.StripeCustomerID, nil
}
