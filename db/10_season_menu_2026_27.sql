-- 10_season_menu_2026_27.sql — real weekly menu for the 2026/27 season.
-- Source: Paradise-Peak-Menu-2026.xlsx (Eugene, 25 Nov 2026). Dish names, French names,
-- allergens and prices follow the Sandy's Orange menu wherever the dish exists there.
--   Mon & Fri  buffet, 55 EUR per adult
--   Tue/Wed/Thu plated: starter / main / dessert priced per dish, sides included with the main
--   Sat        pizza night, delivered from Sandy's Orange, priced per pizza (stored as 'plated', mains only)
--   Sun        closed
-- Safe to run more than once. Existing bookings keep their own (now inactive) menu items.
-- Dates: every service night from the day the script runs (America/Marigot) to 2027-04-30.

begin;

create temp table _season_dish (
  key text primary key, course course_type, name text, name_fr text,
  description text, description_fr text, allergens text[], dietary_ok dietary_flag[], price_eur numeric(6,2)
) on commit drop;

insert into _season_dish values
  ('coconut_shrimp', 'starter', 'Coconut Shrimp', 'Crevettes à la noix de coco', null, null, array['shellfish','egg','gluten','dairy','nuts']::text[], '{}'::dietary_flag[], 17.00),
  ('mixed_salad', 'starter', 'Mixed Salad', 'Salade composée', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('johnny_cakes', 'starter', 'Johnny Cakes', 'Johnny cakes', 'Homemade johnny cakes.', 'Johnny cakes maison.', array['gluten']::text[], '{}'::dietary_flag[], null),
  ('accras', 'starter', 'Accras de Morue', 'Accras de morue', 'Crisp salt cod fritters, chive and scotch bonnet aioli.', 'Accras de morue croustillants, aïoli ciboulette et piment antillais.', array['gluten','fish','egg','mustard','sulphites']::text[], array['pescatarian']::dietary_flag[], 9.00),
  ('house_salad', 'starter', 'House Special Salad', 'Salade maison', 'Mixed greens, cherry tomatoes, cucumber, orange segments, croutons.', 'Mesclun, tomates cerises, concombre, segments d''orange, croûtons.', array['gluten']::text[], array['vegetarian']::dietary_flag[], 12.00),
  ('pumpkin_veloute', 'starter', 'Pumpkin Soup Velouté', 'Velouté de giraumon', 'Island pumpkin, coconut milk, nutmeg.', 'Giraumon, lait de coco, muscade.', '{}'::text[], array['vegetarian','gluten_free']::dietary_flag[], 10.00),
  ('calamari', 'starter', 'Calamari Rings', 'Anneaux de calamars panés', null, null, array['shellfish','gluten','egg','dairy']::text[], array['pescatarian']::dietary_flag[], 15.00),
  ('baked_chicken', 'main', 'Baked Chicken', 'Poulet rôti au four', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('curry_chicken', 'main', 'Curry Chicken', 'Poulet au curry', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('ribs', 'main', 'Ribs', 'Travers de porc', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('flank_steak', 'main', 'Flank Steak, Mushroom Sauce', 'Bavette, sauce aux champignons', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('mahi_buffet', 'main', 'Mahi-Mahi', 'Mahi-mahi', null, null, array['fish']::text[], array['pescatarian']::dietary_flag[], null),
  ('seafood_mix', 'main', 'Seafood Mix (Crab and Prawns)', 'Mélange de fruits de mer (crabe et crevettes)', null, null, array['shellfish']::text[], array['pescatarian']::dietary_flag[], null),
  ('conch', 'main', 'Creole Conch', 'Lambi à la créole', null, null, array['shellfish','sulphites']::text[], array['pescatarian']::dietary_flag[], 23.00),
  ('ribeye', 'main', 'Beef Ribeye, Terracotta Butter', 'Faux-filet, beurre terracotta', '300 g ribeye, smoked paprika butter.', 'Faux-filet de 300 g, beurre au paprika fumé.', array['dairy','mustard','sulphites']::text[], '{}'::dietary_flag[], 32.00),
  ('ragout', 'main', 'Creole Vegetable Ragout', 'Ragoût de légumes créole', 'Root vegetables, okra, coconut, lime leaf.', 'Légumes racines, gombo, coco, feuille de combava.', array['sulphites']::text[], array['vegan','vegetarian','gluten_free']::dietary_flag[], 19.00),
  ('snapper', 'main', 'Grilled Snapper, Mango Sauce', 'Vivaneau grillé, sauce mangue', 'Local snapper, mango sauce, grilled lime.', 'Vivaneau local, sauce mangue, citron vert grillé.', array['fish','sulphites']::text[], array['pescatarian','gluten_free']::dietary_flag[], 28.00),
  ('oxtail', 'main', 'Royal Oxtail', 'Queue de bœuf royale', null, null, array['gluten','sulphites']::text[], '{}'::dietary_flag[], 24.00),
  ('mahi_lemon', 'main', 'Mahi-Mahi, Lemon Zest', 'Mahi-mahi au zeste de citron', null, null, array['fish']::text[], array['pescatarian']::dietary_flag[], 26.00),
  ('stlouis_ribs', 'main', 'St. Louis Style Ribs', 'Travers de porc façon St. Louis', 'Pork ribs in an orange-infused BBQ sauce.', 'Travers de porc, sauce barbecue à l''orange.', '{}'::text[], '{}'::dietary_flag[], 22.00),
  ('pz_margherita', 'main', 'Margherita La Savane', 'Margherita La Savane', 'San Marzano tomato, fior di latte, basil.', 'Tomate San Marzano, fior di latte, basilic.', array['gluten','dairy']::text[], array['vegetarian']::dietary_flag[], 13.00),
  ('pz_kiosk', 'main', 'Orange Kiosk Pizza', 'Pizza du Kiosque Orange', 'Orange-infused tomato base, mozzarella, chorizo, honey drizzle.', 'Base tomate à l''orange, mozzarella, chorizo, filet de miel.', array['gluten','dairy','sulphites']::text[], '{}'::dietary_flag[], 16.00),
  ('pz_bianca', 'main', 'Mahi-Mahi Bianca', 'Bianca au mahi-mahi', 'White base, mahi-mahi, capers, lemon zest, rocket.', 'Base blanche, mahi-mahi, câpres, zeste de citron, roquette.', array['gluten','dairy','fish']::text[], array['pescatarian']::dietary_flag[], 18.00),
  ('pz_piment', 'main', 'Piment Doux Vegetariana', 'Végétarienne au piment doux', 'Roasted sweet peppers, aubergine, goat cheese, thyme.', 'Poivrons doux rôtis, aubergine, fromage de chèvre, thym.', array['gluten','dairy']::text[], array['vegetarian']::dietary_flag[], 15.00),
  ('pz_colombo', 'main', 'Colombo Chicken Pizza', 'Pizza poulet colombo', 'Colombo chicken, red onion, coconut cream, coriander.', 'Poulet colombo, oignon rouge, crème de coco, coriandre.', array['gluten','dairy','mustard']::text[], '{}'::dietary_flag[], 17.00),
  ('rice_peas', 'side', 'Rice and Peas', 'Riz aux pois', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('sauteed_potatoes', 'side', 'Sautéed Potatoes', 'Pommes de terre sautées', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('pasta_mix', 'side', 'Pasta Mix', 'Mélange de pâtes', null, null, array['gluten']::text[], '{}'::dietary_flag[], null),
  ('jasmine_rice', 'side', 'Jasmine Rice', 'Riz jasmin', null, null, '{}'::text[], array['vegan','vegetarian','gluten_free']::dietary_flag[], null),
  ('kiosk_fries', 'side', 'Kiosk Fries', 'Frites du Kiosque', 'Hand-cut fries dusted with creole salt, orange mayo on the side.', 'Frites maison au sel créole, mayonnaise à l''orange.', array['egg','mustard']::text[], array['vegetarian']::dietary_flag[], null),
  ('plantain', 'side', 'Plantain', 'Banane plantain', null, null, '{}'::text[], array['vegan','vegetarian','gluten_free']::dietary_flag[], null),
  ('herb_rice', 'side', 'Herb Rice', 'Riz aux herbes', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('truffle_fries', 'side', 'Truffle Fries', 'Frites à la truffe', null, null, '{}'::text[], '{}'::dietary_flag[], null),
  ('ice_cream', 'dessert', 'Ice Cream', 'Glace', 'Vanilla, hazelnut or strawberry.', 'Vanille, noisette ou fraise.', array['dairy','nuts']::text[], array['vegetarian']::dietary_flag[], null),
  ('creme_brulee', 'dessert', 'Crème Brûlée', 'Crème brûlée', null, null, array['dairy','egg']::text[], array['vegetarian']::dietary_flag[], 12.00),
  ('macarons_ice', 'dessert', 'Ice Cream with Macarons', 'Glace et macarons', 'French macarons with ice cream.', 'Macarons et glace.', array['dairy','egg','nuts']::text[], array['vegetarian']::dietary_flag[], 12.00),
  ('guava_tart', 'dessert', 'Guava Tart with Vanilla Ice Cream', 'Tarte à la goyave, glace vanille', 'Short pastry, guava compote, vanilla ice cream.', 'Pâte sablée, compotée de goyave, glace vanille.', array['gluten','egg','dairy']::text[], array['vegetarian']::dietary_flag[], 9.50);

-- 1. Dish library: update dishes that already exist under the same name and course, add the rest
update dish_library dl
   set name_fr = s.name_fr, description = s.description, description_fr = s.description_fr,
       allergens = s.allergens, dietary_ok = s.dietary_ok, price_eur = s.price_eur, active = true,
       tags = case when 'season-2026-27' = any(coalesce(dl.tags, '{}')) then dl.tags else coalesce(dl.tags, '{}') || 'season-2026-27'::text end,
       updated_at = now()
  from _season_dish s
 where lower(dl.name) = lower(s.name) and dl.course = s.course;

insert into dish_library (name, name_fr, description, description_fr, course, allergens, dietary_ok, price_eur, tags, active)
select s.name, s.name_fr, s.description, s.description_fr, s.course, s.allergens, s.dietary_ok, s.price_eur, array['season-2026-27'], true
  from _season_dish s
 where not exists (select 1 from dish_library dl where lower(dl.name) = lower(s.name) and dl.course = s.course);

-- Test and placeholder dishes leave the library picker (kept in the table for past orders)
update dish_library set active = false, updated_at = now()
 where active and not ('season-2026-27' = any(coalesce(tags, '{}')));

-- 2. Weekly plan (dow: 1 Monday … 6 Saturday)
create temp table _season_night (dow int primary key, service_type text, title text, title_fr text, subtitle text, subtitle_fr text, cover_price_cents int) on commit drop;
insert into _season_night values
  (1, 'buffet', 'Buffet Pirate at Night · Monday', 'Buffet Pirate at Night · Lundi', null, null, 5500),
  (2, 'plated', 'Menu Pirate at Night · Tuesday', 'Menu Pirate at Night · Mardi', null, null, null),
  (3, 'plated', 'Menu Pirate at Night · Wednesday', 'Menu Pirate at Night · Mercredi', null, null, null),
  (4, 'plated', 'Menu Pirate at Night · Thursday', 'Menu Pirate at Night · Jeudi', null, null, null),
  (5, 'buffet', 'Buffet Pirate at Night · Friday', 'Buffet Pirate at Night · Vendredi', null, null, 5500),
  (6, 'plated', 'Pizza Night · Saturday', 'Soirée pizza · Samedi', 'Stone-oven pizzas delivered from Sandy''s Orange.', 'Pizzas au four à pierre, livrées par Sandy''s Orange.', null);

create temp table _season_plan (dow int, key text, sort_order int, primary key (dow, key)) on commit drop;
insert into _season_plan values
  (1, 'coconut_shrimp', 10),
  (1, 'mixed_salad', 20),
  (1, 'johnny_cakes', 30),
  (1, 'accras', 40),
  (1, 'baked_chicken', 50),
  (1, 'curry_chicken', 60),
  (1, 'ribs', 70),
  (1, 'flank_steak', 80),
  (1, 'mahi_buffet', 90),
  (1, 'seafood_mix', 100),
  (1, 'rice_peas', 110),
  (1, 'sauteed_potatoes', 120),
  (1, 'pasta_mix', 130),
  (1, 'ice_cream', 140),
  (1, 'creme_brulee', 150),
  (2, 'house_salad', 10),
  (2, 'pumpkin_veloute', 20),
  (2, 'conch', 30),
  (2, 'ribeye', 40),
  (2, 'ragout', 50),
  (2, 'jasmine_rice', 60),
  (2, 'kiosk_fries', 70),
  (2, 'plantain', 80),
  (2, 'creme_brulee', 90),
  (3, 'calamari', 10),
  (3, 'snapper', 20),
  (3, 'oxtail', 30),
  (3, 'ragout', 40),
  (3, 'jasmine_rice', 50),
  (3, 'herb_rice', 60),
  (3, 'plantain', 70),
  (3, 'macarons_ice', 80),
  (4, 'accras', 10),
  (4, 'mahi_lemon', 20),
  (4, 'stlouis_ribs', 30),
  (4, 'ragout', 40),
  (4, 'truffle_fries', 50),
  (4, 'jasmine_rice', 60),
  (4, 'guava_tart', 70),
  (5, 'coconut_shrimp', 10),
  (5, 'mixed_salad', 20),
  (5, 'johnny_cakes', 30),
  (5, 'accras', 40),
  (5, 'baked_chicken', 50),
  (5, 'curry_chicken', 60),
  (5, 'ribs', 70),
  (5, 'flank_steak', 80),
  (5, 'mahi_buffet', 90),
  (5, 'seafood_mix', 100),
  (5, 'rice_peas', 110),
  (5, 'sauteed_potatoes', 120),
  (5, 'pasta_mix', 130),
  (5, 'ice_cream', 140),
  (5, 'creme_brulee', 150),
  (6, 'pz_margherita', 10),
  (6, 'pz_kiosk', 20),
  (6, 'pz_bianca', 30),
  (6, 'pz_piment', 40),
  (6, 'pz_colombo', 50);

-- 3. Publish every service night of the season in place (same function the dashboard uses)
create temp table _season_result on commit drop as
with lib as (
  select distinct on (s.key) s.key, dl.id
    from _season_dish s
    join dish_library dl on lower(dl.name) = lower(s.name) and dl.course = s.course and dl.active
   order by s.key, dl.created_at
),
nights as (
  select g::date as service_date, extract(dow from g)::int as dow
    from generate_series((now() at time zone 'America/Marigot')::date, date '2027-04-30', interval '1 day') g
),
payload as (
  select jsonb_agg(
           jsonb_build_object(
             'service_date', n.service_date, 'service_type', sn.service_type,
             'title', sn.title, 'title_fr', sn.title_fr, 'subtitle', sn.subtitle, 'subtitle_fr', sn.subtitle_fr,
             'cover_price_cents', sn.cover_price_cents,
             'items', (select jsonb_agg(jsonb_build_object('dish_library_id', l.id, 'sort_order', p.sort_order) order by p.sort_order)
                         from _season_plan p join lib l on l.key = p.key where p.dow = n.dow))
           order by n.service_date) as menus
    from nights n join _season_night sn on sn.dow = n.dow
)
select r.* from payload, lateral publish_weekend_menus(payload.menus, 'season-menu-2026-27') r;

-- Guests are not notified about the season load: drop the notifications this run queued
delete from guest_notifications gn
 using _season_result r
 where gn.menu_id = r.menu_id and gn.status in ('queued', 'pending') and gn.created_at >= now() - interval '5 minutes';

select count(*) as nights_published, min(service_date) as first_night, max(service_date) as last_night from _season_result;

commit;
