// === 1. Define Penang Island boundary ===
var penangDistricts = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM1_NAME', 'Pulau Pinang'))
  .filter(ee.Filter.or(
    ee.Filter.eq('ADM2_NAME', 'Timur Laut'),
    ee.Filter.eq('ADM2_NAME', 'Barat Daya')
  ));

Map.centerObject(penangDistricts, 11);

// === 2. QA Helper Function ===
function bitwiseExtract(value, fromBit, toBit) {
  if (toBit === undefined) toBit = fromBit;
  var maskSize = ee.Number(1).add(toBit).subtract(fromBit);
  var mask = ee.Number(1).leftShift(maskSize).subtract(1);
  return value.rightShift(fromBit).bitwiseAnd(mask);
}

// === 3. QA & cloud filtering for AOD ===
function maskAOD(image) {
  var qa = image.select('AOD_QA');
  var qaHigh = qa.gte(3); // high quality
  var clear = bitwiseExtract(qa, 0, 2).eq(1); // mostly clear
  var aod550 = image.select('Optical_Depth_055').multiply(0.001); // scale factor
  return aod550.updateMask(qaHigh).updateMask(clear);
}

// === 4. Month names for labeling ===
var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// === 5. Loop through 12 months (year 2015) ===
ee.List.sequence(1, 12).getInfo().forEach(function(monthNum) {
  var start = ee.Date.fromYMD(2015, monthNum, 1);
  var end = start.advance(1, 'month');

  var modis = ee.ImageCollection("MODIS/061/MCD19A2_GRANULES")
    .filterBounds(penangDistricts)
    .filterDate(start, end)
    .map(maskAOD);

  var validCount = modis.count();

  var filtered = modis.map(function(img) {
    return img.updateMask(validCount.gte(3)); // Only keep if >=3 days in month
  });

  var meanAOD = filtered.mean().clip(penangDistricts).rename('mean_AOD');

  // === Print AOD stats ===
  var stats = meanAOD.reduceRegion({
    reducer: ee.Reducer.minMax().combine({
      reducer2: ee.Reducer.mean(),
      sharedInputs: true
    }),
    geometry: penangDistricts,
    scale: 1000,
    maxPixels: 1e13
  });

  print('📊 AOD stats for ' + monthNames[monthNum -1] + ' 2015:', stats);

  // === Visualization style ===
  var aodViz = {
    min: 0.00,
    max: 0.8,
    palette: ['green', 'yellow', 'red']
  };

  Map.addLayer(meanAOD, aodViz, 'AOD - ' + monthNames[monthNum - 1] + ' 2015');

  // === OPTIONAL EXPORT ===
  Export.image.toDrive({
    image: meanAOD,
    description: 'Penang_AOD_' + monthNames[monthNum - 1] + '_2015',
    folder: 'Penang_AOD_2015',
    fileNamePrefix: 'Penang_AOD_' + monthNames[monthNum - 1] + '_2015',
    region: penangDistricts.geometry(),
    scale: 1000,
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
  });
});

// === 6. Add AOD Legend Panel ===
var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});

legend.add(ui.Label({
  value: 'AOD Color Scale (550 nm)',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0'}
}));

function makeLegendRow(color, label) {
  return ui.Panel({
    widgets: [
      ui.Label('', {
        backgroundColor: color,
        padding: '8px',
        margin: '0 0 4px 0',
        width: '20px'
      }),
      ui.Label(label, {margin: '0 0 4px 6px'})
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
}

legend.add(makeLegendRow('green', 'Low (0.00 – 0.30)'));
legend.add(makeLegendRow('yellow', 'Moderate (0.30 – 0.50)'));
legend.add(makeLegendRow('red', 'High (≥ 0.50)'));

Map.add(legend);

