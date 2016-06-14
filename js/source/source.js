'use strict';

var util = require('../util/util');
var ajax = require('../util/ajax');
var browser = require('../util/browser');
var normalizeURL = require('../util/mapbox').normalizeSourceURL;
var TileCoord = require('./tile_coord');

exports._loadTileJSON = function(options, callback) {
    var loaded = function(err, tileJSON) {
        if (err) {
            return callback(err);
        }

        var result = util.pick(tileJSON, ['tiles', 'minzoom', 'maxzoom', 'attribution']);

        if (tileJSON.vector_layers) {
            result.vectorLayers = tileJSON.vector_layers;
            result.vectorLayerIds = result.vectorLayers.map(function(layer) { return layer.id; });
        }

        callback(null, result);
    };

    if (options.url) {
        ajax.getJSON(normalizeURL(options.url), loaded);
    } else {
        browser.frame(loaded.bind(null, null, options));
    }
};

function sortTilesIn(a, b) {
    var coordA = a.coord;
    var coordB = b.coord;
    return (coordA.z - coordB.z) || (coordA.y - coordB.y) || (coordA.w - coordB.w) || (coordA.x - coordB.x);
}

function mergeRenderedFeatureLayers(tiles) {
    var result = tiles[0] || {};
    for (var i = 1; i < tiles.length; i++) {
        var tile = tiles[i];
        for (var layerID in tile) {
            var tileFeatures = tile[layerID];
            var resultFeatures = result[layerID];
            if (resultFeatures === undefined) {
                resultFeatures = result[layerID] = tileFeatures;
            } else {
                for (var f = 0; f < tileFeatures.length; f++) {
                    resultFeatures.push(tileFeatures[f]);
                }
            }
        }
    }
    return result;
}

exports._queryRenderedVectorFeatures = function(sourceCache, styleLayers, queryGeometry, params, zoom, bearing) {
    var tilesIn = sourceCache.tilesIn(queryGeometry);

    tilesIn.sort(sortTilesIn);

    var renderedFeatureLayers = [];
    for (var r = 0; r < tilesIn.length; r++) {
        var tileIn = tilesIn[r];
        if (!tileIn.tile.featureIndex) continue;

        renderedFeatureLayers.push(tileIn.tile.featureIndex.query({
            queryGeometry: tileIn.queryGeometry,
            scale: tileIn.scale,
            tileSize: tileIn.tile.tileSize,
            bearing: bearing,
            params: params
        }, styleLayers));
    }
    return mergeRenderedFeatureLayers(renderedFeatureLayers);
};

exports._querySourceFeatures = function(sourceCache, params) {
    var tiles = sourceCache.renderedIDs().map(function(id) {
        return sourceCache.getTileByID(id);
    });

    var result = [];

    var dataTiles = {};
    for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        var dataID = new TileCoord(Math.min(tile.sourceMaxZoom, tile.coord.z), tile.coord.x, tile.coord.y, 0).id;
        if (!dataTiles[dataID]) {
            dataTiles[dataID] = true;
            tile.querySourceFeatures(result, params);
        }
    }

    return result;
};

var sourceTypes = {};

/**
 * @interface Source
 *
 * @fires load to indicate source data has been loaded, so that it's okay to call `loadTile`
 * @fires change to indicate source data has changed, so that any current caches should be flushed
 */

/**
 * @member {string} Source#id
 */
/**
 * @member {number} Source#minzoom
 */
/**
 * @member {number} Source#maxzoom
 */
/**
 * @member {boolean} Source#isTileClipped
 */
/**
 * @member {boolean} Source#reparseOverscaled
 */
/**
 * @member {boolean} Source#roundZoom
 */

/**
 * @method
 * @name Source#loadTile
 * @param {Tile} tile
 * @param {Funtion} callback Called when tile has been loaded
 */

/**
 * @method
 * @name Source#abortTile
 * @param {Tile} tile
 */

/**
 * @method
 * @name Source#unloadTile
 * @param {Tile} tile
 */

/**
 * @method
 * @name Source#serialize
 * @returns {Object} A plain (stringifiable) JS object representing the current state of the source. Creating a source using the returned object as the `options` should result in a Source that is equivalent to this one.
 */

/**
 * @method
 * @name Source#prepare
 */

/*
 * Create a tiled data source instance given an options object
 *
 * @param {Object} options
 * @param {string} options.type Either `raster` or `vector`.
 * @param {string} options.url A tile source URL. This should either be `mapbox://{mapid}` or a full `http[s]` url that points to a TileJSON endpoint.
 * @param {Array} options.tiles An array of tile sources. If `url` is not specified, `tiles` can be used instead to specify tile sources, as in the TileJSON spec. Other TileJSON keys such as `minzoom` and `maxzoom` can be specified in a source object if `tiles` is used.
 * @param {string} options.id An optional `id` to assign to the source
 * @param {number} [options.tileSize=512] Optional tile size (width and height in pixels, assuming tiles are square). This option is only configurable for raster sources
 * @example
 * var sourceObj = new mapboxgl.Source.create({
 *    type: 'vector',
 *    url: 'mapbox://mapbox.mapbox-streets-v6'
 * });
 * map.addSource('some id', sourceObj); // add
 * map.removeSource('some id');  // remove
 */
exports.create = function(id, source, dispatcher) {
    source = sourceTypes[source.type](id, source, dispatcher);

    if (source.id !== id) {
        throw new Error('Expected Source id to be ' + id + ' instead of ' + source.id);
    }

    util.bindAll(['load', 'abort', 'unload', 'serialize', 'prepare'], source);
    return source;
};

exports.getType = function (name) {
    return sourceTypes[name];
};

exports.setType = function (name, type) {
    sourceTypes[name] = type;
};
