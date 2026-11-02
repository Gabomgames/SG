"""Exercita a migração e o SQL real do Worker em SQLite, sem serviços remotos."""
import sqlite3,pathlib,re,unittest
class PaymentsSQL(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.executescript(pathlib.Path('something-gamer-api/migrations/0001_payments.sql').read_text())
  self.db.execute("INSERT INTO payments(id,uid,client_key,plan,days,amount_cents,reference,created_at,updated_at) VALUES ('p1','alice','client1','monthly',30,1490,'sgv_p1',1,1)")
 def test_unique_client_and_order(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO payments(id,uid,client_key,plan,days,amount_cents,reference,created_at,updated_at) VALUES ('p2','alice','client1','annual',365,14990,'sgv_p2',2,2)")
 def test_real_transition_sql_never_restores_refund(self):
  source=pathlib.Path('something-gamer-api/src/payments.js').read_text()
  state=re.search(r'const stateSql = `([^`]+)`',source).group(1)
  update=re.search(r'prepare\(`(UPDATE payments SET state = \$\{stateSql\}[^`]+)`\)',source).group(1).replace('${stateSql}',state)
  def change(incoming,now):self.db.execute(update,(incoming,incoming,incoming,incoming,incoming,now,incoming,now,'p1'))
  change('approved',10);self.assertEqual(self.db.execute('SELECT state,approved_at,review FROM payments').fetchone(),('approved',10,'pending'))
  change('pending',20);self.assertEqual(self.db.execute('SELECT state,approved_at FROM payments').fetchone(),('approved',10))
  change('revoked',30);change('approved',40);self.assertEqual(self.db.execute('SELECT state,approved_at FROM payments').fetchone(),('revoked',10))
 def test_audit_is_immutable(self):
  self.db.execute("INSERT INTO admin_audit VALUES ('a1','owner','review','p1','approved',1)")
  for sql in ["UPDATE admin_audit SET result='rejected'","DELETE FROM admin_audit"]:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(sql)
 def test_migration_is_idempotent(self):self.db.executescript(pathlib.Path('something-gamer-api/migrations/0001_payments.sql').read_text());self.assertEqual(self.db.execute('SELECT COUNT(*) FROM payments').fetchone()[0],1)
if __name__=='__main__':unittest.main()
