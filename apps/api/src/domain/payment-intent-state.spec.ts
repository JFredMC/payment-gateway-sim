import {
  canCancel,
  canConfirm,
  canRefund,
  canTransition,
  isTerminal,
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_INTENT_STATUSES,
  refundState,
  STATUS_LABELS_ES,
  statusAfterFailure,
} from './payment-intent-state';

describe('payment intent state machine', () => {
  it('follows the documented happy and unhappy paths', () => {
    expect(canTransition('requires_payment_method', 'processing')).toBe(true);
    expect(canTransition('processing', 'succeeded')).toBe(true);
    expect(canTransition('processing', 'requires_action')).toBe(true);
    expect(canTransition('processing', 'requires_payment_method')).toBe(true);
    expect(canTransition('requires_action', 'processing')).toBe(true);
    expect(canTransition('requires_action', 'canceled')).toBe(true);
  });

  it('never leaves a terminal state', () => {
    for (const terminal of ['succeeded', 'failed', 'canceled'] as const) {
      expect(isTerminal(terminal)).toBe(true);
      for (const to of PAYMENT_INTENT_STATUSES) expect(canTransition(terminal, to)).toBe(false);
    }
  });

  it('cannot skip processing', () => {
    expect(canTransition('requires_payment_method', 'succeeded')).toBe(false);
    expect(canTransition('requires_action', 'succeeded')).toBe(false);
  });

  it('only confirms pending intents and cancels before completion', () => {
    expect(canConfirm('requires_payment_method')).toBe(true);
    expect(canConfirm('requires_action')).toBe(false);
    expect(canCancel('requires_payment_method')).toBe(true);
    expect(canCancel('requires_action')).toBe(true);
    expect(canCancel('processing')).toBe(false);
    expect(canCancel('succeeded')).toBe(false);
  });

  it('refunds only what is left of a succeeded intent', () => {
    expect(canRefund('succeeded', 1000, 0)).toBe(true);
    expect(canRefund('succeeded', 1000, 1000)).toBe(false);
    expect(canRefund('failed', 1000, 0)).toBe(false);
    expect(refundState(1000, 0)).toBe('none');
    expect(refundState(1000, 400)).toBe('partial');
    expect(refundState(1000, 1000)).toBe('full');
  });

  it(`fails after ${MAX_PAYMENT_ATTEMPTS} attempts`, () => {
    expect(statusAfterFailure(1)).toBe('requires_payment_method');
    expect(statusAfterFailure(MAX_PAYMENT_ATTEMPTS)).toBe('failed');
  });

  it('has a Spanish label for every status', () => {
    for (const status of PAYMENT_INTENT_STATUSES) expect(STATUS_LABELS_ES[status]).toBeTruthy();
  });
});
