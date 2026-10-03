import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  authResponse,
  el,
  problem,
  query,
  settle,
  text,
  typeInto,
} from '../../../testing/fixtures';
import { RegisterPage } from './register.page';

describe('RegisterPage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function fillAndSubmit(password = 'Secreta123') {
    const fixture = TestBed.createComponent(RegisterPage);
    await fixture.whenStable();
    typeInto(fixture, '#businessName', '  Café La Montaña ');
    typeInto(fixture, '#fullName', ' Ana Gómez ');
    typeInto(fixture, '#email', 'ana@example.com');
    typeInto(fixture, '#password', password);
    el(fixture, 'form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    return fixture;
  }

  it('signs up the merchant with a snake_case body and opens the dashboard', async () => {
    const fixture = await fillAndSubmit();
    const req = http.expectOne('/api/v1/auth/register');
    expect(req.request.body).toEqual({
      business_name: 'Café La Montaña',
      full_name: 'Ana Gómez',
      email: 'ana@example.com',
      password: 'Secreta123',
    });
    req.flush(authResponse());
    await settle(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inicio');
  });

  it('enforces the password rule before calling the API', async () => {
    await fillAndSubmit('solotexto');
    http.expectNone('/api/v1/auth/register');
  });

  it('explains a duplicate email', async () => {
    const fixture = await fillAndSubmit();
    http
      .expectOne('/api/v1/auth/register')
      .flush(problem(409, 'EMAIL_ALREADY_REGISTERED'), { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(text(query(fixture, '[data-testid="problem"]'))).toContain('Ya existe una cuenta');
  });
});
