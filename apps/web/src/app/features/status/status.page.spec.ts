import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { StatusPage } from './status.page';

describe('StatusPage', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [StatusPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(StatusPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const text = () =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="api-status"]')
        ?.textContent;
    return { fixture, http, text };
  }

  it('reports the API as available when the health check is ok', async () => {
    const { fixture, http, text } = setup();
    expect(text()).toContain('Verificando');
    http.expectOne('/api/v1/health').flush({ status: 'ok' });
    await fixture.whenStable();
    expect(text()).toContain('API disponible');
  });

  it('reports the API as down on error', async () => {
    const { fixture, http, text } = setup();
    http.expectOne('/api/v1/health').flush(null, { status: 503, statusText: 'Down' });
    await fixture.whenStable();
    expect(text()).toContain('no responde');
  });
});
