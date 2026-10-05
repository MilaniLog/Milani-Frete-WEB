-- Preparação manual para banco existente. Revisar antes de executar.
-- Não usar db push: o schema ativo representa apenas parte do banco legado.
-- CREATE IF NOT EXISTS não corrige tabelas existentes com estrutura diferente.
-- As estruturas abaixo seguem o backup; constraints adicionais do banco legado
-- são preservadas quando as tabelas já existem.

CREATE TABLE IF NOT EXISTS `frete_despesas` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `unit` INTEGER NOT NULL,
  `codigo` VARCHAR(10) NOT NULL,
  `nome` VARCHAR(120) NOT NULL,
  `tipo` VARCHAR(20) NOT NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_frete_despesa_unit_codigo` (`unit`, `codigo`),
  INDEX `idx_frete_despesa_tipo` (`tipo`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `frete_lancamentos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `numero` INTEGER NOT NULL,
  `unit` INTEGER NOT NULL,
  `semana` CHAR(4) NULL,
  `placa` VARCHAR(20) NULL,
  `motorista` VARCHAR(100) NULL,
  `tipo_veiculo` VARCHAR(100) NULL,
  `destino` VARCHAR(150) NULL,
  `codigo_despesa` VARCHAR(10) NOT NULL,
  `nome_despesa` VARCHAR(120) NOT NULL,
  `tipo_despesa` VARCHAR(20) NOT NULL,
  `data_lancamento` DATE NOT NULL,
  `valor` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `descricao` VARCHAR(255) NULL,
  `pago` BOOLEAN NOT NULL DEFAULT false,
  `manifesto_id` INTEGER NULL,
  `fechamento_id` INTEGER NULL,
  `responsavel_cod` INTEGER NULL,
  `departamento` VARCHAR(30) NULL,
  `emitido_em` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_frete_lancamento_numero` (`unit`, `numero`),
  INDEX `idx_frete_lancamento_fechamento` (`fechamento_id`),
  INDEX `idx_frete_lancamento_manifesto` (`manifesto_id`),
  INDEX `idx_frete_lancamento_placa` (`placa`),
  INDEX `idx_frete_lancamento_responsavel` (`responsavel_cod`),
  INDEX `idx_frete_lancamento_semana` (`semana`),
  INDEX `idx_frete_lancamento_tipo` (`tipo_despesa`)
) ENGINE=InnoDB;

-- O backend anterior usava SP como padrão e não persistia origem.
-- Conferir a origem real do histórico antes de permitir recálculos desses registros.
SET @freight_origin_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name = 'frete_carregamento_manifestos' AND column_name = 'origem'),
  'SELECT 1',
  'ALTER TABLE frete_carregamento_manifestos ADD COLUMN origem VARCHAR(10) NOT NULL DEFAULT ''SP'''
);
PREPARE freight_origin_stmt FROM @freight_origin_ddl;
EXECUTE freight_origin_stmt;
DEALLOCATE PREPARE freight_origin_stmt;
