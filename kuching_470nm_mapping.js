// === 1. Define Kuching boundary ===
var kuching = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM1_NAME', 'Sarawak'))
  .filter(ee.Filter.eq('ADM2_NAME', 'Kuching'));

Map.centerObject(kuching, 10);

// === 2. QA helper function ===
function bitwiseExtract(value, fromBit, toBit) {
  if (toBit === undefined) toBit = fromBit;
  var maskSize = ee.Number(1).add(toBit).subtract(fromBit);
  var mask = ee.Number(1).leftShift(maskSize).subtract(1);
  return value.rightShift(fromBit).bitwiseAnd(mask);
}

// === 3. QA & cloud mask function ===
function maskAOD(image) {
  var qa = image.select('AOD_QA');
  var qaHigh = qa.gte(3); // high quality only
  var clear = bitwiseExtract(qa, 0, 1).eq(1); // clear or mostly clear
  var aod470 = image.select('Optical_Depth_047').multiply(0.001);
  return aod470.updateMask(qaHigh).updateMask(clear);
}

// === 4. Month names for labeling ===
var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// === 5. Loop over months 1-12 of 2015 ===
ee.List.sequence(1, 12).getInfo().forEach(function(monthNum) {
  var start = ee.Date.fromYMD(2015, monthNum, 1);
  var end = start.advance(1, 'month');

  var modis = ee.ImageCollection('MODIS/061/MCD19A2_GRANULES')
    .filterBounds(kuching)
    .filterDate(start, end)
    .map(maskAOD);

  var validCount = modis.count();

  // Mask pixels with less than 3 valid observations
  var filtered = modis.map(function(img) {
    return img.updateMask(validCount.gte(3));
  });

  var meanAOD = filtered.mean().clip(kuching).rename('mean_AOD');

  // Print stats
  var stats = meanAOD.reduceRegion({
    reducer: ee.Reducer.minMax().combine({
      reducer2: ee.Reducer.mean(),
      sharedInputs: true
    }),
    geometry: kuching,
    scale: 1000,
    maxPixels: 1e13
  });

  print('📊 Mean AOD 470nm for ' + monthNames[monthNum - 1] + ' 2015:', stats);

  // Add to map
  Map.addLayer(meanAOD, {
    min: 0,
    max: 0.8,
    palette: ['green', 'yellow', 'red']
  }, 'Mean AOD 470nm - ' + monthNames[monthNum - 1] + ' 2015');

  // === Export to GeoTIFF ===
  Export.image.toDrive({
    image: meanAOD,
    description: 'Kuching_AOD_' + monthNames[monthNum - 1] + '_2015',
    folder: 'Kuching_AOD_2015',
    fileNamePrefix: 'Kuching_AOD_' + monthNames[monthNum - 1] + '_2015',
    region: kuching.geometry(),
    scale: 1000,
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
  });
});

// === 6. Legend ===
var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
legend.add(ui.Label({
  value: 'AOD (470 nm) Color Scale',
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
legend.add(makeLegendRow('green', '(Low: 0.00 – 0.30)'));
legend.add(makeLegendRow('yellow', '(Moderate: 0.30 – 0.50)'));
legend.add(makeLegendRow('red', '(High: ≥ 0.5)'));
Map.add(legend);
