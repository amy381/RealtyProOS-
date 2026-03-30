-- Create public storage bucket for vendor PDF forms
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-pdfs', 'vendor-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket
CREATE POLICY "vendor_pdfs_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'vendor-pdfs');

CREATE POLICY "vendor_pdfs_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'vendor-pdfs');

CREATE POLICY "vendor_pdfs_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'vendor-pdfs');

CREATE POLICY "vendor_pdfs_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'vendor-pdfs');
