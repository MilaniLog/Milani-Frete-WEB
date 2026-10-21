-- Todos os usuários atuais permanecem como operação até a classificação manual.
ALTER TABLE `employees`
  ADD COLUMN IF NOT EXISTS `freight_profile` VARCHAR(20) NOT NULL DEFAULT 'OPERACAO' AFTER `isAdmin`;

-- Valores aceitos pela aplicação: OPERACAO, FINANCEIRO e RH.
-- Exemplos para ajustar depois, usando o código do funcionário:
-- UPDATE `employees` SET `freight_profile` = 'FINANCEIRO' WHERE `cod` = 123;
-- UPDATE `employees` SET `freight_profile` = 'RH' WHERE `cod` = 456;
