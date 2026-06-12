-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Subsecretarias
CREATE TABLE public.subsecretarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    orden INT DEFAULT 0,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Areas
CREATE TABLE public.areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subsecretaria_id UUID NOT NULL REFERENCES public.subsecretarias(id) ON DELETE RESTRICT,
    nombre TEXT NOT NULL,
    orden INT DEFAULT 0,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(subsecretaria_id, nombre)
);

-- 3. Users Profile Extension
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre_completo TEXT,
    rol TEXT NOT NULL DEFAULT 'viewer' CHECK (rol IN ('admin', 'editor', 'subsecretario', 'viewer')),
    subsecretaria_id UUID REFERENCES public.subsecretarias(id) ON DELETE SET NULL,
    activo BOOLEAN DEFAULT TRUE,
    push_subscription JSONB,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Responsables
CREATE TABLE public.responsables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_completo TEXT NOT NULL,
    dni TEXT NOT NULL UNIQUE,
    telefono TEXT,
    email TEXT,
    area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
    subsecretaria_id UUID REFERENCES public.subsecretarias(id) ON DELETE SET NULL,
    cargo TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Semestres
CREATE TABLE public.semestres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anio INT NOT NULL,
    numero_semestre INT NOT NULL CHECK (numero_semestre IN (1, 2)),
    nombre_display TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    activo BOOLEAN DEFAULT FALSE,
    bloqueado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(anio, numero_semestre)
);

-- 6. Categorias Becas
CREATE TABLE public.categorias_becas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semestre_id UUID NOT NULL REFERENCES public.semestres(id) ON DELETE CASCADE,
    numero_categoria INT NOT NULL CHECK (numero_categoria BETWEEN 1 AND 6),
    monto DECIMAL(12, 2) NOT NULL,
    porcentaje_activa DECIMAL(5, 2) DEFAULT 10.00,
    monto_activa DECIMAL(12, 2) GENERATED ALWAYS AS (ROUND(monto * porcentaje_activa / 100.00, 2)) STORED,
    total DECIMAL(12, 2) GENERATED ALWAYS AS (ROUND(monto + (monto * porcentaje_activa / 100.00), 2)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(semestre_id, numero_categoria)
);

-- 7. Categorias Monotributistas
CREATE TABLE public.categorias_monotributistas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semestre_id UUID NOT NULL REFERENCES public.semestres(id) ON DELETE CASCADE,
    letra CHAR(1) NOT NULL,
    descripcion_categoria TEXT,
    monto DECIMAL(12, 2) NOT NULL,
    porcentaje_activa DECIMAL(5, 2) DEFAULT 10.00,
    monto_activa DECIMAL(12, 2) GENERATED ALWAYS AS (ROUND(monto * porcentaje_activa / 100.00, 2)) STORED,
    total DECIMAL(12, 2) GENERATED ALWAYS AS (ROUND(monto + (monto * porcentaje_activa / 100.00), 2)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(semestre_id, letra)
);

-- 8. Becarios
CREATE TABLE public.becarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subsecretaria_id UUID REFERENCES public.subsecretarias(id) ON DELETE RESTRICT,
    area_id UUID REFERENCES public.areas(id) ON DELETE RESTRICT,
    responsable_id UUID REFERENCES public.responsables(id) ON DELETE SET NULL,
    categoria_beca_id UUID REFERENCES public.categorias_becas(id) ON DELETE SET NULL,
    cuit TEXT,
    dni TEXT NOT NULL UNIQUE,
    apellido_nombre TEXT NOT NULL,
    fecha_nacimiento DATE,
    cbu TEXT,
    tarjeta_activa_nro TEXT,
    telefono TEXT,
    email TEXT,
    nacionalidad TEXT,
    codigo_postal TEXT,
    provincia TEXT,
    departamento TEXT,
    localidad TEXT,
    barrio TEXT,
    calle TEXT,
    nro TEXT,
    piso TEXT,
    depto TEXT,
    lote TEXT,
    manzana TEXT,
    importe_mensual_beca DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    importe_tarjeta_activa DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    importe_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Baja')),
    fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_baja DATE,
    motivo_baja TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Monotributistas
CREATE TABLE public.monotributistas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subsecretaria_id UUID REFERENCES public.subsecretarias(id) ON DELETE RESTRICT,
    area_id UUID REFERENCES public.areas(id) ON DELETE RESTRICT,
    responsable_id UUID REFERENCES public.responsables(id) ON DELETE SET NULL,
    categoria_mono_id UUID REFERENCES public.categorias_monotributistas(id) ON DELETE SET NULL,
    cuit TEXT,
    dni TEXT NOT NULL UNIQUE,
    apellido_nombre TEXT NOT NULL,
    fecha_nacimiento DATE,
    cbu TEXT,
    tarjeta_activa_nro TEXT,
    telefono TEXT,
    email TEXT,
    nacionalidad TEXT,
    codigo_postal TEXT,
    provincia TEXT,
    departamento TEXT,
    localidad TEXT,
    barrio TEXT,
    calle TEXT,
    nro TEXT,
    piso TEXT,
    depto TEXT,
    lote TEXT,
    manzana TEXT,
    importe_mensual_monotributo DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    importe_tarjeta_activa DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    importe_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Baja')),
    fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_baja DATE,
    motivo_baja TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Snapshots Semestre
CREATE TABLE public.snapshots_semestre (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semestre_id UUID NOT NULL REFERENCES public.semestres(id) ON DELETE CASCADE,
    total_becarios_activos INT,
    total_monotributistas_activos INT,
    total_monto_becas DECIMAL(12, 2),
    total_monto_monotributos DECIMAL(12, 2),
    total_activa_becas DECIMAL(12, 2),
    total_activa_monos DECIMAL(12, 2),
    gran_total_semestre DECIMAL(12, 2),
    categorias_becas_snapshot JSONB,
    categorias_monos_snapshot JSONB,
    nomina_becarios_snapshot JSONB,
    nomina_monos_snapshot JSONB,
    ordenes_compromiso_snapshot JSONB,
    generado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Campanas Documentacion
CREATE TABLE public.campanas_documentacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    tipo_documentos_requeridos JSONB NOT NULL,
    aplica_a TEXT NOT NULL CHECK (aplica_a IN ('becarios', 'monotributistas', 'ambos')),
    fecha_inicio DATE NOT NULL,
    fecha_limite DATE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cerrada', 'vencida')),
    creado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Documentos
CREATE TABLE public.documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('becario', 'monotributista')),
    persona_id UUID NOT NULL,
    nombre_archivo TEXT NOT NULL,
    tipo_documento TEXT NOT NULL,
    url_supabase TEXT,
    url_google_drive TEXT,
    tamano_bytes BIGINT,
    fecha_emision DATE,
    fecha_vencimiento DATE,
    fecha_turno DATE,
    es_turno BOOLEAN DEFAULT FALSE,
    version INT DEFAULT 1,
    estado_revision TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_revision IN ('pendiente', 'aprobado', 'rechazado')),
    observaciones_revision TEXT,
    subido_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    revisado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    campana_id UUID REFERENCES public.campanas_documentacion(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Vencimientos Seguros
CREATE TABLE public.vencimientos_seguros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monotributista_id UUID NOT NULL REFERENCES public.monotributistas(id) ON DELETE CASCADE,
    documento_id UUID REFERENCES public.documentos(id) ON DELETE CASCADE,
    fecha_vencimiento DATE NOT NULL,
    alerta_30_dias_enviada BOOLEAN DEFAULT FALSE,
    alerta_15_dias_enviada BOOLEAN DEFAULT FALSE,
    alerta_7_dias_enviada BOOLEAN DEFAULT FALSE,
    alerta_vencido_enviada BOOLEAN DEFAULT FALSE,
    estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'por_vencer', 'vencido')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. Historial Importaciones
CREATE TABLE public.historial_importaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL CHECK (tipo IN ('becarios', 'monotributistas')),
    nombre_archivo TEXT NOT NULL,
    total_registros INT DEFAULT 0,
    registros_exitosos INT DEFAULT 0,
    registros_con_error INT DEFAULT 0,
    detalle_errores JSONB,
    resumen JSONB,
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. Movimientos
CREATE TABLE public.movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('becario', 'monotributista')),
    persona_id UUID NOT NULL,
    tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('alta', 'baja', 'cambio_monto', 'cambio_categoria')),
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    descripcion TEXT,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. Historial Montos
CREATE TABLE public.historial_montos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('becario', 'monotributista')),
    persona_id UUID NOT NULL,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto_anterior DECIMAL(12, 2),
    monto_nuevo DECIMAL(12, 2),
    activa_anterior DECIMAL(12, 2),
    activa_nueva DECIMAL(12, 2),
    total_anterior DECIMAL(12, 2),
    total_nuevo DECIMAL(12, 2),
    categoria_anterior TEXT,
    categoria_nueva TEXT,
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 17. Liquidaciones Mensuales
CREATE TABLE public.liquidaciones_mensuales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('becario', 'monotributista')),
    persona_id UUID NOT NULL,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto_beca_o_mono DECIMAL(12, 2) NOT NULL,
    monto_tarjeta_activa DECIMAL(12, 2) NOT NULL,
    total_liquidado DECIMAL(12, 2) NOT NULL,
    estado_liquidacion TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_liquidacion IN ('pendiente', 'procesada', 'pagada')),
    semestre_id UUID REFERENCES public.semestres(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 18. Ordenes Compromiso
CREATE TABLE public.ordenes_compromiso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semestre_id UUID NOT NULL REFERENCES public.semestres(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('becas', 'monotributos', 'activa_becas', 'activa_monotributos')),
    monto_asignado DECIMAL(12, 2) NOT NULL,
    monto_ejecutado DECIMAL(12, 2) DEFAULT 0.00,
    numero_oc TEXT NOT NULL,
    descripcion TEXT,
    fecha_carga DATE NOT NULL DEFAULT CURRENT_DATE,
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 19. Campana Entregas
CREATE TABLE public.campana_entregas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campana_id UUID NOT NULL REFERENCES public.campanas_documentacion(id) ON DELETE CASCADE,
    tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('becario', 'monotributista')),
    persona_id UUID NOT NULL,
    estado_entrega TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_entrega IN ('pendiente', 'entregado', 'vencido', 'rechazado')),
    fecha_entrega DATE,
    observaciones TEXT,
    revisado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 20. Tags
CREATE TABLE public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 21. Persona Tags
CREATE TABLE public.persona_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('becario', 'monotributista')),
    persona_id UUID NOT NULL,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(persona_id, tag_id)
);

-- 22. Notificaciones
CREATE TABLE public.notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('alerta', 'info', 'warning', 'exito')),
    link TEXT,
    leida BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 23. Audit Log
CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    accion TEXT NOT NULL,
    tabla_afectada TEXT NOT NULL,
    registro_id UUID,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Triggers for auto-updating updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_becarios_updated_at BEFORE UPDATE ON public.becarios
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_monotributistas_updated_at BEFORE UPDATE ON public.monotributistas
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_ordenes_compromiso_updated_at BEFORE UPDATE ON public.ordenes_compromiso
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_campana_entregas_updated_at BEFORE UPDATE ON public.campana_entregas
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Trigger for public.users profile creation on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, nombre_completo, rol, activo)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'nombre_completo', 'Nuevo Usuario'),
        COALESCE(NEW.raw_user_meta_data->>'rol', 'viewer'),
        TRUE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
