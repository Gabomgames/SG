# Now Mark — mapa e proximidade

## O que já funciona
- Leaflet + OpenStreetMap.
- Busca por cidade, bairro, CEP ou endereço usando Nominatim.
- Geolocalização do navegador.
- Raio sugerido e personalizado.
- Local exato ou aproximado.
- Mapa de anúncios com pins de preço.
- Distância por Haversine.
- "Pesquisar nesta área".

## Privacidade
Quando o vendedor usa `local aproximado`, a coordenada pública é reduzida antes de ser gravada no anúncio. O endereço residencial exato não deve ser exibido publicamente.

## Produção em escala
Nominatim público possui política de uso e não deve receber tráfego pesado. Para produção comercial em escala, substitua a função de geocodificação por um provider dedicado, por exemplo Mapbox Geocoding ou Google Maps Geocoding.

Mantenha no frontend apenas chaves públicas restritas ao domínio quando o provider exigir. Qualquer secret de servidor deve ficar no backend.
