-- Seed Subsecretarías
INSERT INTO public.subsecretarias (id, nombre, orden, activa) VALUES
('6fdcede0-76ed-4968-a4bd-67307b9e446f', 'Subsecretaria de Cultura', 1, TRUE),
('67464fb5-646c-4f19-b67d-aff024d39801', 'Subsecretaria de Deportes', 2, TRUE),
('b8024214-6bad-4136-a6bf-8fb7e3eebc7f', 'Subsecretaria de Gestion Participativa', 3, TRUE),
('53b007a2-5c15-4e70-9d64-c7f3222813cf', 'Subsecretaria de Politicas Vecinales', 4, TRUE),
('a6e95bab-5c54-41df-a199-a4970bc0e083', 'Subsecretaria de Vecinalismo', 5, TRUE),
('96ecea8f-83ab-47cd-b8b8-9783a555a881', 'Subsecretaria de Vinculacion Comunitaria', 6, TRUE),
('08f976b4-f437-4257-b3d1-72ea84882787', 'Dirección Gral de Vinculación y Comunicación', 7, TRUE),
('76200721-59c9-4c22-aa5a-3521aec0d4df', 'Secretaria Fortalecimiento Vecinal y Deportes', 8, TRUE),
('f3a31002-cbd4-4c46-8683-b30c1954a788', 'Centro Cultural Manuel de Falla', 9, TRUE),
('2090cc32-6710-4344-8a8c-119bb29bdec9', 'Direcion de Centros Vecinales', 10, TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- Seed Areas
INSERT INTO public.areas (id, subsecretaria_id, nombre, orden, activa) VALUES
('a1110000-0000-0000-0000-000000000001', '67464fb5-646c-4f19-b67d-aff024d39801', 'Dirección de Deportes Social', 1, TRUE),
('a1120000-0000-0000-0000-000000000002', '6fdcede0-76ed-4968-a4bd-67307b9e446f', 'Dirección de Industrias Creativas', 1, TRUE),
('a1130000-0000-0000-0000-000000000003', 'a6e95bab-5c54-41df-a199-a4970bc0e083', 'Dirección de Centros Vecinales', 1, TRUE),
('a1140000-0000-0000-0000-000000000004', 'b8024214-6bad-4136-a6bf-8fb7e3eebc7f', 'Dirección de Presupuesto Participativo', 1, TRUE),
('a1150000-0000-0000-0000-000000000005', '08f976b4-f437-4257-b3d1-72ea84882787', 'Oficina de Prensa y Comunicación', 1, TRUE)
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
