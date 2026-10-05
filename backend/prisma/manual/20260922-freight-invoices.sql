-- Additive preparation: only new freight financial tables.
-- Existing invoices (tickets) is not modified. Run once on verified schema.

-- CreateTable
CREATE TABLE `frete_tipos_nota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `unit` INTEGER NOT NULL,
    `codigo` VARCHAR(10) NOT NULL,
    `nome` VARCHAR(120) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `frete_tipos_nota_unit_codigo_key`(`unit`, `codigo`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `frete_notas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `unit` INTEGER NOT NULL,
    `numero` VARCHAR(30) NOT NULL,
    `data_nota` DATE NOT NULL,
    `emitido_em` DATE NOT NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `saldo` DECIMAL(15, 2) NOT NULL,
    `tipo_id` INTEGER NOT NULL,
    `codigo_tipo` VARCHAR(10) NOT NULL,
    `nome_tipo` VARCHAR(120) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `responsavel_cod` INTEGER NOT NULL,
    `departamento` VARCHAR(30) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `frete_notas_unit_numero_key`(`unit`, `numero`),
    UNIQUE INDEX `frete_notas_id_unit_key`(`id`, `unit`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `frete_cupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `unit` INTEGER NOT NULL,
    `nota_id` INTEGER NOT NULL,
    `placa` VARCHAR(20) NOT NULL,
    `motorista` VARCHAR(100) NOT NULL,
    `tipo_veiculo` VARCHAR(100) NOT NULL,
    `semana` CHAR(4) NOT NULL,
    `data_cobranca` DATE NOT NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `pago` BOOLEAN NOT NULL DEFAULT false,
    `fechamento_id` INTEGER NULL,
    `responsavel_cod` INTEGER NOT NULL,
    `departamento` VARCHAR(30) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `frete_cupons_unit_semana_placa_idx`(`unit`, `semana`, `placa`),
    INDEX `frete_cupons_nota_id_unit_idx`(`nota_id`, `unit`),
    INDEX `frete_cupons_fechamento_id_idx`(`fechamento_id`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `frete_cupons` ADD CONSTRAINT `frete_cupons_nota_id_unit_fkey` FOREIGN KEY (`nota_id`, `unit`) REFERENCES `frete_notas`(`id`, `unit`) ON DELETE RESTRICT ON UPDATE CASCADE;
