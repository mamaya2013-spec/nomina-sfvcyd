-- Seed Subsecretarías
INSERT INTO public.subsecretarias (id, nombre, orden, activa) VALUES
('b3310000-0000-0000-0000-000000000001', 'Gral de Vinculación y Comunicación', 1, TRUE),
('b3320000-0000-0000-0000-000000000002', 'Subsecretaría de Cultura', 2, TRUE),
('b3330000-0000-0000-0000-000000000003', 'Subsecretaría de Deportes', 3, TRUE),
('b3340000-0000-0000-0000-000000000004', 'Subsecretaría de Gestión Participativa', 4, TRUE),
('b3350000-0000-0000-0000-000000000005', 'Subsecretaría de Políticas Vecinales', 5, TRUE),
('b3360000-0000-0000-0000-000000000006', 'Subsecretaría de Vecinalismo', 6, TRUE),
('b3370000-0000-0000-0000-000000000007', 'Subsecretaría de Vinculación Comunitaria', 7, TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- Seed Areas
INSERT INTO public.areas (id, subsecretaria_id, nombre, orden, activa) VALUES
('a1110000-0000-0000-0000-000000000001', 'b3330000-0000-0000-0000-000000000002', 'Dirección de Deportes Social', 1, TRUE),
('a1120000-0000-0000-0000-000000000002', 'b3320000-0000-0000-0000-000000000002', 'Dirección de Industrias Creativas', 1, TRUE),
('a1130000-0000-0000-0000-000000000003', 'b3360000-0000-0000-0000-000000000006', 'Dirección de Centros Vecinales', 1, TRUE),
('a1140000-0000-0000-0000-000000000004', 'b3340000-0000-0000-0000-000000000004', 'Dirección de Presupuesto Participativo', 1, TRUE),
('a1150000-0000-0000-0000-000000000005', 'b3310000-0000-0000-0000-000000000001', 'Oficina de Prensa y Comunicación', 1, TRUE)
ON CONFLICT (subsecretaria_id, nombre) DO NOTHING;

-- Seed Semestre Actual (2026 - 1S)
INSERT INTO public.semestres (id, anio, numero_semestre, nombre_display, fecha_inicio, fecha_fin, activo, bloqueado) VALUES
('e4410000-0000-0000-0000-000000000001', 2026, 1, '2026 - Primer Semestre (Ene-Jun)', '2026-01-01', '2026-06-30', TRUE, FALSE)
ON CONFLICT (anio, numero_semestre) DO NOTHING;

-- Seed Categorías de Becas (1 al 6) para el Semestre 2026 - 1S
INSERT INTO public.categorias_becas (semestre_id, numero_categoria, monto, porcentaje_activa) VALUES
('e4410000-0000-0000-0000-000000000001', 1, 181500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 2, 280500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 3, 363000.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 4, 462000.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 5, 577500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 6, 693000.00, 10.00)
ON CONFLICT (semestre_id, numero_categoria) DO NOTHING;

-- Seed Categorías de Monotributistas (A a K) para el Semestre 2026 - 1S
INSERT INTO public.categorias_monotributistas (semestre_id, letra, descripcion_categoria, monto, porcentaje_activa) VALUES
('e4410000-0000-0000-0000-000000000001', 'A', 'Tareas Generales Cat.3', 346500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'B', 'Tareas Generales Cat.2', 462000.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'C', 'Tareas Generales Cat.1', 577500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'D', 'Tareas Administrativas Cat.3', 693000.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'E', 'Tareas Administrativas Cat.2', 808500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'F', 'Tareas Administrativas Cat.1', 924000.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'G', 'Subcoordinador', 1039500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'H', 'Coordinador', 1155000.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'I', 'Coordinador General', 1380500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'J', 'Supervisor', 1611500.00, 10.00),
('e4410000-0000-0000-0000-000000000001', 'K', 'Especialista', 1842500.00, 10.00)
ON CONFLICT (semestre_id, letra) DO NOTHING;
