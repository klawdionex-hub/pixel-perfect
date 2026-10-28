-- Vendedores que prefieren recibir completo a cada cliente nuevo (tarjeta, datos y conversación)
-- en vez de la ficha con "Lo tomo". El cliente queda a nombre del primero que cotice o registre un resultado.
ALTER TABLE public.usuarios_perfil ADD COLUMN IF NOT EXISTS recibe_directo BOOLEAN NOT NULL DEFAULT false;
