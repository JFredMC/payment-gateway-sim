import { cardMethod } from '../../../testing/fixtures';
import { checkoutUrl, methodSummary } from './payments';

describe('payments utils', () => {
  it('summarises each payment method without exposing more than the last digits', () => {
    expect(methodSummary(null)).toBe('—');
    expect(methodSummary(cardMethod())).toBe('Visa •••• 4242');
    expect(
      methodSummary(
        cardMethod({
          card: { brand: 'amex', last4: '0005', exp_month: 1, exp_year: 2030, funding: 'credit' },
        }),
      ),
    ).toBe('American Express •••• 0005');
    expect(
      methodSummary(
        cardMethod({
          type: 'pse',
          card: null,
          pse: { bank_code: '1007', bank_name: 'Banco de Prueba', person_type: 'natural' },
        }),
      ),
    ).toBe('PSE · Banco de Prueba');
    expect(
      methodSummary(cardMethod({ type: 'nequi', card: null, nequi: { phone_last4: '4567' } })),
    ).toBe('Nequi ••• 4567');
  });

  it('builds checkout links relative to the base href (GitHub Pages sub-path)', () => {
    expect(checkoutUrl('pi_1', 'pi_1_secret_a+b', 'http://localhost:4200/')).toBe(
      'http://localhost:4200/checkout/pi_1?secret=pi_1_secret_a%2Bb',
    );
    expect(checkoutUrl('pi_1', 's', 'https://jfredmc.github.io/payment-gateway-sim/')).toBe(
      'https://jfredmc.github.io/payment-gateway-sim/checkout/pi_1?secret=s',
    );
  });
});
