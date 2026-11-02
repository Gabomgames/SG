import unittest,sqlite3,pathlib
class MarketSQL(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for p in sorted(pathlib.Path('something-gamer-api/migrations').glob('*.sql')):self.db.executescript(p.read_text())
  self.db.execute("INSERT INTO market_products(id,seller_uid,title,description,category,condition,price_cents,stock,return_policy,created_at,updated_at) VALUES ('p1','seller','Console','Real','Consoles','Usado',10000,1,'Devolução válida',1,1)")
  self.db.commit()
 def order(self,oid,buyer='buyer',unit=10000,offer=None):
  with self.db:
   self.db.execute('INSERT INTO market_orders(id,buyer_uid,seller_uid,client_key,subtotal_cents,shipping_cents,commission_cents,total_cents,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',(oid,buyer,'seller',oid,unit,0,unit//10,unit,100,2,2))
   self.db.execute('INSERT INTO market_order_items VALUES (?,?,?,?,?,?)',(oid,'p1',1,unit,'Console',offer))
 def stock(self):return self.db.execute('SELECT stock,reserved FROM market_products').fetchone()
 def test_concurrent_last_item(self):
  self.order('o1');self.assertEqual(self.stock(),(1,1))
  with self.assertRaises(sqlite3.IntegrityError):self.order('o2','buyer2')
  self.assertIsNone(self.db.execute("SELECT id FROM market_orders WHERE id='o2'").fetchone())
  self.assertEqual(self.stock(),(1,1))
 def test_price_tampering_rolls_back(self):
  with self.assertRaises(sqlite3.IntegrityError):self.order('o1',unit=100)
  self.assertEqual(self.stock(),(1,0))
 def test_cancel_releases_and_paid_consumes_once(self):
  self.order('o1');self.db.execute("UPDATE market_orders SET state='cancelled' WHERE id='o1'");self.assertEqual(self.stock(),(1,0))
  self.order('o2');self.db.execute("UPDATE market_orders SET state='paid' WHERE id='o2'");self.assertEqual(self.stock(),(0,0))
  self.db.execute("UPDATE market_orders SET state='paid' WHERE id='o2'");self.assertEqual(self.stock(),(0,0))
 def test_single_use_offer(self):
  self.db.execute("INSERT INTO market_offers(id,product_id,buyer_uid,seller_uid,amount_cents,quantity,state,last_actor,expires_at,created_at,updated_at) VALUES ('f1','p1','buyer','seller',9000,1,'accepted','seller',100,1,1)");self.db.commit()
  self.order('o1',unit=9000,offer='f1');self.assertEqual(self.db.execute("SELECT state,order_id FROM market_offers").fetchone(),('consumed','o1'))
  self.db.execute("UPDATE market_orders SET state='cancelled' WHERE id='o1'");self.db.commit()
  with self.assertRaises(sqlite3.IntegrityError):self.order('o2',unit=9000,offer='f1')
 def test_buyer_cannot_buy_own_product(self):
  with self.assertRaises(sqlite3.IntegrityError):self.order('o1','seller')
 def test_review_only_after_delivery(self):
  self.order('o1')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO market_reviews VALUES ('o1','buyer','seller',5,'Bom',1)")
  self.db.execute("UPDATE market_orders SET state='paid' WHERE id='o1'");self.db.execute("UPDATE market_orders SET state='delivered' WHERE id='o1'")
  self.db.execute("INSERT INTO market_reviews VALUES ('o1','buyer','seller',5,'Bom',1)")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO market_reviews VALUES ('o1','buyer','seller',5,'Duplicado',1)")
 def test_migrations_idempotent(self):
  for p in sorted(pathlib.Path('something-gamer-api/migrations').glob('*.sql')):self.db.executescript(p.read_text())
  self.assertEqual(self.stock(),(1,0))
if __name__=='__main__':unittest.main()
