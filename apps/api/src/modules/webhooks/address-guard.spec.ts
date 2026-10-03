import { isBlockedAddress, isPublicHost } from './address-guard';

describe('webhook address guard', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['93.184.215.14', '8.8.8.8', '2606:4700:4700::1111'])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('checks literal IP hosts without DNS', async () => {
    await expect(isPublicHost('127.0.0.1')).resolves.toBe(false);
    await expect(isPublicHost('[::1]')).resolves.toBe(false);
    await expect(isPublicHost('8.8.8.8')).resolves.toBe(true);
    await expect(isPublicHost('localhost')).resolves.toBe(false);
  });
});
