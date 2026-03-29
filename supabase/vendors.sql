-- Add escrow_number and bathrooms to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS escrow_number text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bathrooms     text;

-- Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL DEFAULT '',
  vendor_type    text        NOT NULL DEFAULT '',
  contact_method text        NOT NULL DEFAULT '',
  email          text,
  phone          text,
  website_url    text,
  pdf_form_url   text,
  field_mappings jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Pre-load vendors (field_mappings built via jsonb_build_array to avoid JSON string parsing)

INSERT INTO vendors (name, vendor_type, contact_method, email, field_mappings)
VALUES (
  'Kingman Septic Pumping',
  'Septic',
  'PDF Form + Email',
  'vivs@citlink.net',
  jsonb_build_array('realtor_phone','realtor_email','realtor_name','company','property_address','bedrooms','vacant_or_occupied','apn','title_company','title_contact_name','title_email','seller_name','buyer_name','close_of_escrow','year_built')
);

INSERT INTO vendors (name, vendor_type, contact_method, email, field_mappings)
VALUES (
  'Calvin''s Septic Service',
  'Septic',
  'PDF Form + Email',
  'calvinsseptic2011@yahoo.com',
  jsonb_build_array('company','realtor_name','realtor_email','realtor_phone','property_address','apn','vacant_or_occupied','bedrooms','title_company','escrow_number','title_contact_name','close_of_escrow','seller_name','buyer_name','year_built')
);

INSERT INTO vendors (name, vendor_type, contact_method, email, field_mappings)
VALUES (
  'Kingman Portable Toilets',
  'Septic',
  'PDF Form + Email',
  'Kptandseptic@aol.com',
  jsonb_build_array('company','realtor_name','realtor_phone','realtor_email','property_address','apn','bedrooms','vacant_or_occupied','year_built','title_company','title_contact_name','title_email','title_phone','close_of_escrow')
);

INSERT INTO vendors (name, vendor_type, contact_method, email, field_mappings)
VALUES (
  'City of Kingman Permits',
  'Permits',
  'PDF Form + Email',
  'cityclerk@cityofkingman.gov',
  jsonb_build_array('property_address','apn','realtor_name','realtor_phone','realtor_email')
);

INSERT INTO vendors (name, vendor_type, contact_method, email, field_mappings)
VALUES (
  'Mohave County Permits',
  'Permits',
  'Email Only',
  '',
  '[]'::jsonb
);
