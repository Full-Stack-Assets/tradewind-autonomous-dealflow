export interface DomainEvent {
  eventId: string;
  workflowId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  schemaVersion: '1';
  payload: Record<string, unknown>;
}

export class InMemoryEventStore {
  private readonly events: DomainEvent[] = [];

  append(event: DomainEvent): void {
    this.events.push({ ...event, payload: { ...event.payload } });
  }

  all(): DomainEvent[] {
    return this.events.map((event) => ({ ...event, payload: { ...event.payload } }));
  }
}
