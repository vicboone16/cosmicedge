
CREATE TABLE public.app_handshake (
  id integer PRIMARY KEY DEFAULT 1,
  app_slug text NOT NULL DEFAULT 'cosmicedge',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE public.app_handshake ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read handshake" ON public.app_handshake
  FOR SELECT USING (true);

INSERT INTO public.app_handshake (id, app_slug) VALUES (1, 'cosmicedge');
