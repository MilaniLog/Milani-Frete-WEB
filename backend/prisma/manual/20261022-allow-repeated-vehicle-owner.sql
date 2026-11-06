-- Um proprietario pode possuir varios veiculos. Somente a placa identifica
-- exclusivamente um veiculo.
ALTER TABLE `companies`
  DROP INDEX `fantasy_name`,
  ADD INDEX `idx_companies_fantasy_name` (`fantasy_name`);
