CREATE TABLE IF NOT EXISTS `frete_faturas_vales` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `numero` INT NOT NULL,
  `unit` INT NOT NULL,
  `periodo_inicio` DATE NOT NULL,
  `periodo_fim` DATE NOT NULL,
  `quantidade` INT NOT NULL,
  `valor_total` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `responsavel_cod` INT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'FECHADA',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `frete_faturas_vales_numero_key` (`numero`),
  KEY `idx_frete_fatura_periodo` (`unit`, `periodo_inicio`, `periodo_fim`),
  KEY `idx_frete_fatura_responsavel` (`responsavel_cod`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `frete_lancamentos`
  ADD COLUMN IF NOT EXISTS `fatura_id` INT NULL,
  ADD COLUMN IF NOT EXISTS `numero_fatura` INT NULL;

CREATE INDEX IF NOT EXISTS `idx_frete_lancamento_fatura`
  ON `frete_lancamentos` (`fatura_id`);
CREATE INDEX IF NOT EXISTS `idx_frete_lancamento_numero_fatura`
  ON `frete_lancamentos` (`numero_fatura`);

ALTER TABLE `frete_lancamentos`
  ADD CONSTRAINT `fk_frete_lancamento_fatura`
  FOREIGN KEY (`fatura_id`) REFERENCES `frete_faturas_vales` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
