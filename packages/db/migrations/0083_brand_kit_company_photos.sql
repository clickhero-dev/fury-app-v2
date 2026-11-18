-- Fotos do estabelecimento são referência distinta de produto, equipe e modelo.
ALTER TYPE "brand_kit_photo_kind" ADD VALUE IF NOT EXISTS 'empresa';
