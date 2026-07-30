BEGIN;

DROP TABLE IF EXISTS transaction_journal;
DROP TABLE IF EXISTS reservation_journal_sequences;
DROP TABLE IF EXISTS credit_reservations;
DROP TABLE IF EXISTS credit_wallets;

COMMIT;
