-- Servicio 10: Compra de equipo (motores, pistones, refacciones). El bot muestra la opción en el menú
-- solo cuando este servicio existe y está activo. Comisión inicial 3 %, editable en Configuración → Servicios.
INSERT INTO public.servicios (codigo, nombre, tipo, requiere_equipo, porcentaje_comision, activo)
VALUES (10, 'Compra de equipo', 'venta', false, 3, true)
ON CONFLICT (codigo) DO NOTHING;
