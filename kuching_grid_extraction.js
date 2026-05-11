// ---------------------------------------------
// CONFIGURATION
// ---------------------------------------------
var station = {
  name: "Kuching",
  lat: 1.490556,
  lon: 110.348611,
  startDate: '2012-01-01',
  endDate: '2012-01-31'
};
// ---------------------------------------------
// GEOMETRY WITH TRUE 3x3 GRID
// ---------------------------------------------
var pixelSize = 1000;
var point = ee.Geometry.Point([station.lon, station.lat]);
Map.centerObject(point, 13);
Map.addLayer(point, {color: 'red'}, 'Station');
var gridPoints = [];
for (var row = 0; row < 3; row++) {
  for (var col = 0; col < 3; col++) {
    var xOffset = (col - 1);
    var yOffset = (1 - row);
    var lonOffset = xOffset * (pixelSize / 111000);
    var latOffset = yOffset * (pixelSize / 111000);
    var gridPoint = ee.Geometry.Point([
      station.lon + lonOffset,
      station.lat + latOffset
    ]);
    gridPoints.push(ee.Feature(gridPoint, {
      'grid_id': 'P' + (row * 3 + col + 1),
      'row': row,
      'col': col,
      'longitude': station.lon + lonOffset,
      'latitude': station.lat + latOffset
    }));
  }
}
var gridCollection = ee.FeatureCollection(gridPoints);
Map.addLayer(gridCollection, {color: 'yellow'}, '3x3 Grid');
Map.addLayer(gridCollection.geometry().convexHull(), {color: 'blue'}, 'Grid Boundary');
// ---------------------------------------------
// QA HELPER FUNCTION
// ---------------------------------------------
function bitwiseExtract(value, fromBit, toBit) {
  if (toBit === undefined) toBit = fromBit;
  var maskSize = ee.Number(1).add(toBit).subtract(fromBit);
  var mask = ee.Number(1).leftShift(maskSize).subtract(1);
  return value.rightShift(fromBit).bitwiseAnd(mask);
}
// ---------------------------------------------
// MODIS MAIAC COLLECTION
// ---------------------------------------------
var maiacCollection = ee.ImageCollection("MODIS/061/MCD19A2_GRANULES")
  .filterBounds(gridCollection.geometry())
  .filterDate(station.startDate, station.endDate);
// ---------------------------------------------
// SAMPLE AOD FROM 3x3 GRID FOR EACH IMAGE
// With QA and Cloud Mask applied
// ---------------------------------------------
var processImage = function(image) {
  var date = ee.Date(image.get('system:time_start'));
  // Apply strict QA filtering and cloud mask
  var qa = image.select('AOD_QA');
  var qaMask = qa.gte(3); // high quality only
  var cloudMask = bitwiseExtract(qa, 0, 2).eq(1); // clear or mostly clear
  var cleanAOD = image
    .updateMask(qaMask)
    .updateMask(cloudMask)
    .select('Optical_Depth_055')
    .multiply(0.001);
  var sampled = gridCollection.map(function(f) {
    var aod = cleanAOD.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: f.geometry(),
      scale: 1500
    }).get('Optical_Depth_055');
    return f.set({
      'AOD': aod,
      'date': date.format('YYYY-MM-dd'),
      'grid_id': f.get('grid_id'),
      'row': f.get('row'),
      'col': f.get('col'),
      'latitude': f.get('latitude'),
      'longitude': f.get('longitude')
    });
  });
  return sampled;
};
var allSamples = maiacCollection.map(processImage).flatten();
var validSamples = allSamples.filter(ee.Filter.notNull(['AOD']));
// ---------------------------------------------
// EXPORT
// ---------------------------------------------
print("Valid AOD Samples:", validSamples.size());
print("Sample Output:", validSamples.limit(10));
Export.table.toDrive({
  collection: validSamples,
  description: 'MODIS_AOD_3x3_Kuching_Jan2012_Final',
  fileFormat: 'CSV'
});