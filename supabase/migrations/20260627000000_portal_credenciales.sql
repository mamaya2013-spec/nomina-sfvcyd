-- Portal de Responsables: Credenciales y Log de Sesiones
-- Migration: 20260627000000_portal_credenciales.sql

-- Tabla de credenciales del portal
CREATE TABLE IF NOT EXISTS public.portal_credenciales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    responsable_id UUID NOT NULL UNIQUE REFERENCES public.responsables(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    ultimo_acceso TIMESTAMPTZ,
    intentos_fallidos INT DEFAULT 0,
    bloqueado_hasta TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_username ON public.portal_credenciales(username);
CREATE INDEX IF NOT EXISTS idx_portal_responsable ON public.portal_credenciales(responsable_id);

-- Log de sesiones del portal
CREATE TABLE IF NOT EXISTS public.portal_sesiones_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    responsable_id UUID NOT NULL REFERENCES public.responsables(id) ON DELETE CASCADE,
    accion TEXT NOT NULL, -- 'login', 'logout', 'login_fallido'
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_sesiones_responsable ON public.portal_sesiones_log(responsable_id);

-- Trigger para auto-update de updated_at
CREATE OR REPLACE TRIGGER update_portal_credenciales_updated_at
    BEFORE UPDATE ON public.portal_credenciales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: Activar para seguridad
ALTER TABLE public.portal_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sesiones_log ENABLE ROW LEVEL SECURITY;

-- Policy: solo acceso anón/service_role (las API routes usan service_role internamente via Supabase SSR)
CREATE POLICY "portal_credenciales_all" ON public.portal_credenciales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "portal_sesiones_log_all" ON public.portal_sesiones_log FOR ALL USING (true) WITH CHECK (true);
