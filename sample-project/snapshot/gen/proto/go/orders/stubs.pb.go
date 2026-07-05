package orders

type TrackOrderOrdersMessage struct {
	OrderId string `json:"orderId"`
}

type TrackOrderOrdersEvent struct {
	Status    string `json:"status"`
	UpdatedAt string `json:"updatedAt"`
}

func (m *TrackOrderOrdersMessage) GetOrderId() string {
	if m != nil {
		return m.OrderId
	}
	return ""
}

func (m *TrackOrderOrdersEvent) GetStatus() string {
	if m != nil {
		return m.Status
	}
	return ""
}

func (m *TrackOrderOrdersEvent) GetUpdatedAt() string {
	if m != nil {
		return m.UpdatedAt
	}
	return ""
}
