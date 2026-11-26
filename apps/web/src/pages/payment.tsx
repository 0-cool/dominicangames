import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Api, errorMessage, type PaymentRow } from '../lib/api.ts';
import { useAuth } from '../lib/auth.ts';
import { fmtDateTime, formatDop } from '../lib/format.ts';
import { useTitle } from '../lib/useTitle.ts';
import { Container } from '../components/Layout.tsx';
import { Alert, Card, IconCheck, IconX, LinkButton, Spinner } from '../components/ui.tsx';

/**
 * The RD$100 purchase page no longer exists: Santo Domingo Open World is free. Old links (emails, bookmarks)
 * land on the game page with a “now free” notice.
 */
export function LegacyPaymentRedirect() {
  return <Navigate to="/juegos/santo-domingo-open-world?gratis=1" replace />;
}

const TERMINAL = new Set(['succeeded', 'failed', 'canceled', 'refunded']);

/**
 * Status of a payment started before DominicanGames became free (a provider may still send the player back
 * here). It only displays what the server recorded; playing never depends on it.
 */
export function PaymentResultPage() {
  useTitle('Estado del pago', { noindex: true });
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const { refresh } = useAuth();
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      setError('No encontramos ese pago.');
      return;
    }
    let stop = false;
    const started = Date.now();
    const poll = async () => {
      try {
        const r = await Api.payment(id);
        if (stop) return;
        setPayment(r.payment);
        if (TERMINAL.has(r.payment.status)) {
          await refresh();
          return;
        }
      } catch (e) {
        if (stop) return;
        setError(errorMessage(e));
        return;
      }
      if (Date.now() - started > 90_000) return setTimedOut(true);
      setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [id, refresh]);

  const status = payment?.status;
  return (
    <Container narrow className="py-20">
      <Card className="p-10 text-center">
        <div data-testid="payment-status" data-status={status ?? (error ? 'error' : 'loading')}>
          {error ? (
            <>
              <h1 className="brand-title text-3xl text-white">No pudimos cargar el pago</h1>
              <Alert tone="error" className="mt-5 text-left">{error}</Alert>
            </>
          ) : !payment || !TERMINAL.has(payment.status) ? (
            <>
              <div className="mx-auto mb-5 flex size-16 items-center justify-center text-dg-red-400">
                <Spinner className="size-12" />
              </div>
              <h1 className="brand-title text-3xl text-white">Consultando tu pago…</h1>
              <p className="mt-3 text-ink-300">Estamos esperando la confirmación del banco.</p>
              {timedOut && (
                <Alert tone="warning" className="mt-6 text-left" title="Está tardando más de lo normal">
                  Puedes revisar el historial en tu panel o escribir a soporte con la referencia <code className="text-xs">{id.slice(0, 8)}</code>.
                </Alert>
              )}
            </>
          ) : status === 'succeeded' ? (
            <>
              <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-full bg-leaf-500/15 text-leaf-500 animate-pop">
                <IconCheck className="size-10" />
              </div>
              <h1 className="brand-title text-3xl text-white">Pago registrado</h1>
              <dl className="mx-auto mt-6 max-w-xs space-y-1.5 text-left text-sm">
                <div className="flex justify-between text-ink-400"><dt>Monto</dt><dd className="text-ink-100">{formatDop(payment.amount)}</dd></div>
                <div className="flex justify-between text-ink-400"><dt>Fecha</dt><dd className="text-ink-100">{fmtDateTime(payment.paidAt ?? payment.createdAt)}</dd></div>
                <div className="flex justify-between text-ink-400"><dt>Referencia</dt><dd className="font-mono text-xs text-ink-100">{payment.id.slice(0, 8).toUpperCase()}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-full bg-coral-500/15 text-coral-500 animate-pop">
                <IconX className="size-10" />
              </div>
              <h1 className="brand-title text-3xl text-white">{status === 'refunded' ? 'Pago reembolsado' : 'El pago no se completó'}</h1>
              <p className="mt-3 text-ink-300">{status === 'refunded' ? 'Este pago fue reembolsado.' : 'No se hizo ningún cargo.'}</p>
            </>
          )}
          <Alert tone="info" className="mt-8 text-left" title="Ya no tienes que pagar para jugar">
            Santo Domingo Open World ahora es gratis con tu cuenta DominicanGames.
          </Alert>
          <LinkButton to="/jugar" size="lg" className="mt-6 w-full" data-testid="go-play">
            Jugar gratis
          </LinkButton>
          <LinkButton to="/panel" variant="ghost" className="mt-2 w-full">
            Ir a mi panel
          </LinkButton>
        </div>
      </Card>
    </Container>
  );
}
