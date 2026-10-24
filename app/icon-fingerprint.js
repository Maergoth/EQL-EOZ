/** EQL Wiki Icon Finder algorithm 6, reused at the repository owner’s request.
 * Source: Maergoth/EQLWiki commit 27d52901a3a3913acfe0e13abe0b2e5306c0576e
 * extensions/EQL-Editor-Tools-Icon-Finder/MediaWiki_IconFinder.js
 * Exact drawScaled/fingerprint/distance function bodies retained.
 * See THIRD_PARTY/EQL-Icon-Finder/README.md for source provenance.
 */
const COLOR_GRID=16;
	function drawScaled( drawable, width, height, cropFraction ) {
		var sourceCanvas = document.createElement( 'canvas' );
		var sourceWidth =
			Number( drawable.width || drawable.naturalWidth ) || 1;
		var sourceHeight =
			Number( drawable.height || drawable.naturalHeight ) || 1;
		var sourceCtx;
		var sourceImage;
		var sourceData;
		var pixelCount = sourceWidth * sourceHeight;
		var transparentCount = 0;
		var mask = new Uint8Array( pixelCount );
		var foregroundCount = 0;
		var borderR = [];
		var borderG = [];
		var borderB = [];
		var bgR = 0;
		var bgG = 0;
		var bgB = 0;
		var bgLuma = 0;
		var borderSpread = [];
		var tolerance;
		var darkCutoff;
		var minX = sourceWidth;
		var minY = sourceHeight;
		var maxX = -1;
		var maxY = -1;
		var cleanCanvas;
		var cleanCtx;
		var cleanImage;
		var targetCanvas;
		var targetCtx;
		var usableWidth;
		var usableHeight;
		var scale;
		var drawWidth;
		var drawHeight;
		var drawX;
		var drawY;
		var i;
		var p;
		var x;
		var y;
		var r;
		var g;
		var b;
		var a;
		var luma;
		var chroma;
		var maxChannel;
		var minChannel;
		var colorDistance;

		function median( values ) {
			var sorted;

			if ( !values.length ) {
				return 0;
			}

			sorted = values.slice().sort(
				function ( left, right ) {
					return left - right;
				}
			);

			return sorted[
				Math.floor( sorted.length / 2 )
			];
		}

		function addBorderPixel( px, py ) {
			var index =
				( py * sourceWidth + px ) * 4;

			if ( sourceData[ index + 3 ] < 16 ) {
				return;
			}

			borderR.push( sourceData[ index ] );
			borderG.push( sourceData[ index + 1 ] );
			borderB.push( sourceData[ index + 2 ] );
		}

		sourceCanvas.width = sourceWidth;
		sourceCanvas.height = sourceHeight;

		sourceCtx = sourceCanvas.getContext(
			'2d',
			{
				willReadFrequently: true
			}
		);

		/*
		 * Preserve real PNG transparency.
		 */
		sourceCtx.clearRect(
			0,
			0,
			sourceWidth,
			sourceHeight
		);

		sourceCtx.drawImage(
			drawable,
			0,
			0
		);

		sourceImage = sourceCtx.getImageData(
			0,
			0,
			sourceWidth,
			sourceHeight
		);

		sourceData = sourceImage.data;

		for ( i = 0; i < pixelCount; i++ ) {
			if ( sourceData[ i * 4 + 3 ] < 245 ) {
				transparentCount++;
			}
		}

		if (
			transparentCount >
			Math.max( 4, pixelCount * 0.01 )
		) {
			/*
			 * Uploaded transparent PNG:
			 * alpha is already an excellent mask.
			 */
			for ( i = 0; i < pixelCount; i++ ) {
				if (
					sourceData[ i * 4 + 3 ] > 24
				) {
					mask[ i ] = 1;
					foregroundCount++;
				}
			}
		} else {
			/*
			 * Pasted screenshot:
			 *
			 * Infer the UI background from a two-pixel
			 * border around the capture.
			 */
			for (
				x = 0;
				x < sourceWidth;
				x++
			) {
				for (
					y = 0;
					y < Math.min(
						2,
						sourceHeight
					);
					y++
				) {
					addBorderPixel(
						x,
						y
					);

					addBorderPixel(
						x,
						sourceHeight - 1 - y
					);
				}
			}

			for (
				y = 0;
				y < sourceHeight;
				y++
			) {
				for (
					x = 0;
					x < Math.min(
						2,
						sourceWidth
					);
					x++
				) {
					addBorderPixel(
						x,
						y
					);

					addBorderPixel(
						sourceWidth - 1 - x,
						y
					);
				}
			}

			bgR = median( borderR );
			bgG = median( borderG );
			bgB = median( borderB );

			bgLuma = luminance(
				bgR,
				bgG,
				bgB
			);

			for (
				i = 0;
				i < borderR.length;
				i++
			) {
				borderSpread.push(
					Math.sqrt(
						Math.pow(
							borderR[ i ] - bgR,
							2
						) +
						Math.pow(
							borderG[ i ] - bgG,
							2
						) +
						Math.pow(
							borderB[ i ] - bgB,
							2
						)
					)
				);
			}

			/*
			 * The old crop variants blindly trimmed the
			 * image square.
			 *
			 * Now they instead make background removal
			 * slightly more aggressive.
			 */
			tolerance = Math.max(
				20,
				Math.min(
					74,
					18 +
						median(
							borderSpread
						) * 2.5 +
						cropFraction * 80
				)
			);

			darkCutoff = Math.max(
				36,
				Math.min(
					88,
					bgLuma +
						22 +
						cropFraction * 100
				)
			);

			for (
				i = 0;
				i < pixelCount;
				i++
			) {
				p = i * 4;

				r = sourceData[ p ];
				g = sourceData[ p + 1 ];
				b = sourceData[ p + 2 ];
				a = sourceData[ p + 3 ];

				if ( a < 16 ) {
					continue;
				}

				maxChannel = Math.max(
					r,
					g,
					b
				);

				minChannel = Math.min(
					r,
					g,
					b
				);

				chroma =
					maxChannel -
					minChannel;

				luma = luminance(
					r,
					g,
					b
				);

				colorDistance =
					Math.sqrt(
						Math.pow(
							r - bgR,
							2
						) +
						Math.pow(
							g - bgG,
							2
						) +
						Math.pow(
							b - bgB,
							2
						)
					);

				/*
				 * EQ's editor/game icon background is
				 * normally very dark.
				 *
				 * Discard dark neutral pixels, but allow
				 * strongly colored pixels to survive at
				 * lower brightness.
				 */
				if ( bgLuma < 95 ) {
					if (
						(
							luma >=
								darkCutoff &&
							colorDistance >=
								tolerance *
								0.65
						) ||
						(
							chroma >= 24 &&
							luma >=
								bgLuma +
								7 +
								cropFraction *
								30 &&
							colorDistance >=
								tolerance *
								0.55
						)
					) {
						mask[ i ] = 1;
						foregroundCount++;
					}
				} else if (
					colorDistance >=
					tolerance
				) {
					mask[ i ] = 1;
					foregroundCount++;
				}
			}

			/*
			 * Fail soft for an unusual image instead of
			 * producing an empty fingerprint.
			 */
			if (
				foregroundCount < 6 ||
				foregroundCount >
					pixelCount * 0.90
			) {
				mask.fill( 0 );
				foregroundCount = 0;

				for (
					i = 0;
					i < pixelCount;
					i++
				) {
					if (
						sourceData[
							i * 4 + 3
						] > 24
					) {
						mask[ i ] = 1;
						foregroundCount++;
					}
				}
			}
		}

		/*
		 * Find the actual sprite bounds.
		 */
		for (
			y = 0;
			y < sourceHeight;
			y++
		) {
			for (
				x = 0;
				x < sourceWidth;
				x++
			) {
				i =
					y * sourceWidth +
					x;

				if ( !mask[ i ] ) {
					continue;
				}

				minX = Math.min(
					minX,
					x
				);

				minY = Math.min(
					minY,
					y
				);

				maxX = Math.max(
					maxX,
					x
				);

				maxY = Math.max(
					maxY,
					y
				);
			}
		}

		if (
			maxX < minX ||
			maxY < minY
		) {
			minX = 0;
			minY = 0;
			maxX = sourceWidth - 1;
			maxY = sourceHeight - 1;
		}

		/*
		 * Create a transparent copy containing only
		 * detected foreground pixels.
		 */
		cleanCanvas =
			document.createElement(
				'canvas'
			);

		cleanCanvas.width =
			sourceWidth;

		cleanCanvas.height =
			sourceHeight;

		cleanCtx =
			cleanCanvas.getContext(
				'2d',
				{
					willReadFrequently: true
				}
			);

		cleanImage =
			cleanCtx.createImageData(
				sourceWidth,
				sourceHeight
			);

		for (
			i = 0;
			i < pixelCount;
			i++
		) {
			if ( !mask[ i ] ) {
				continue;
			}

			p = i * 4;

			cleanImage.data[ p ] =
				sourceData[ p ];

			cleanImage.data[ p + 1 ] =
				sourceData[ p + 1 ];

			cleanImage.data[ p + 2 ] =
				sourceData[ p + 2 ];

			cleanImage.data[ p + 3 ] =
				255;
		}

		cleanCtx.putImageData(
			cleanImage,
			0,
			0
		);

		/*
		 * Normalize the detected sprite to the requested
		 * comparison size.
		 */
		targetCanvas =
			document.createElement(
				'canvas'
			);

		targetCanvas.width = width;
		targetCanvas.height = height;

		targetCtx =
			targetCanvas.getContext(
				'2d',
				{
					willReadFrequently: true
				}
			);

		targetCtx.fillStyle = '#000';

		targetCtx.fillRect(
			0,
			0,
			width,
			height
		);

		targetCtx.imageSmoothingEnabled =
			true;

		if (
			'imageSmoothingQuality' in
			targetCtx
		) {
			targetCtx.imageSmoothingQuality =
				'high';
		}

		usableWidth =
			Math.max(
				1,
				width - 2
			);

		usableHeight =
			Math.max(
				1,
				height - 2
			);

		scale = Math.min(
			usableWidth /
				Math.max(
					1,
					maxX - minX + 1
				),
			usableHeight /
				Math.max(
					1,
					maxY - minY + 1
				)
		);

		drawWidth = Math.max(
			1,
			Math.round(
				(
					maxX -
					minX +
					1
				) * scale
			)
		);

		drawHeight = Math.max(
			1,
			Math.round(
				(
					maxY -
					minY +
					1
				) * scale
			)
		);

		drawX = Math.floor(
			(
				width -
				drawWidth
			) / 2
		);

		drawY = Math.floor(
			(
				height -
				drawHeight
			) / 2
		);

		targetCtx.drawImage(
			cleanCanvas,
			minX,
			minY,
			maxX - minX + 1,
			maxY - minY + 1,
			drawX,
			drawY,
			drawWidth,
			drawHeight
		);

		return targetCtx.getImageData(
			0,
			0,
			width,
			height
		);
	}
	function luminance( r, g, b ) {
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}

	function computeDHash( drawable, cropFraction ) {
		var imageData = drawScaled( drawable, 9, 8, cropFraction );
		var data = imageData.data;
		var hi = 0;
		var lo = 0;
		var bit = 0;
		var y;
		var x;
		var left;
		var right;
		var li;
		var ri;

		for ( y = 0; y < 8; y++ ) {
			for ( x = 0; x < 8; x++ ) {
				li = ( y * 9 + x ) * 4;
				ri = ( y * 9 + x + 1 ) * 4;

				left = luminance(
					data[ li ],
					data[ li + 1 ],
					data[ li + 2 ]
				);

				right = luminance(
					data[ ri ],
					data[ ri + 1 ],
					data[ ri + 2 ]
				);

				if ( left > right ) {
					if ( bit < 32 ) {
						lo = ( lo | ( 1 << bit ) ) >>> 0;
					} else {
						hi = ( hi | ( 1 << ( bit - 32 ) ) ) >>> 0;
					}
				}

				bit++;
			}
		}

		return {
			hi: hi >>> 0,
			lo: lo >>> 0
		};
	}

	function computeColorGrid( drawable, cropFraction ) {
		var imageData = drawScaled(
			drawable,
			COLOR_GRID,
			COLOR_GRID,
			cropFraction
		);
		var data = imageData.data;
		var out = new Uint8Array( COLOR_GRID * COLOR_GRID * 3 );
		var source = 0;
		var target = 0;

		while ( source < data.length ) {
			out[ target++ ] = data[ source ];
			out[ target++ ] = data[ source + 1 ];
			out[ target++ ] = data[ source + 2 ];
			source += 4;
		}

		return out;
	}

	function fingerprintDrawable( drawable, cropFraction ) {
		var hash = computeDHash( drawable, cropFraction );

		return {
			hashHi: hash.hi,
			hashLo: hash.lo,
			rgb: computeColorGrid( drawable, cropFraction )
		};
	}

	function popcount32( value ) {
		value = value >>> 0;
		value = value - ( ( value >>> 1 ) & 0x55555555 );
		value = ( value & 0x33333333 ) + ( ( value >>> 2 ) & 0x33333333 );
		return (
			(
				(
					value + ( value >>> 4 )
				) & 0x0F0F0F0F
			) * 0x01010101
		) >>> 24;
	}

	function fingerprintDistance( a, b ) {
		var hashBits =
			popcount32(
				(
					a.hashHi ^
					b.hashHi
				) >>> 0
			) +
			popcount32(
				(
					a.hashLo ^
					b.hashLo
				) >>> 0
			);

		var hashDistance =
			hashBits / 64;

		var length = Math.min(
			a.rgb.length,
			b.rgb.length
		);

		var histogramA =
			new Uint16Array( 64 );

		var histogramB =
			new Uint16Array( 64 );

		var foregroundA = 0;
		var foregroundB = 0;
		var intersection = 0;
		var union = 0;
		var colorSum = 0;
		var i;
		var ar;
		var ag;
		var ab;
		var br;
		var bg;
		var bb;
		var aForeground;
		var bForeground;
		var dr;
		var dg;
		var db;
		var binA;
		var binB;
		var shapeDistance;
		var colorDistance;
		var histogramDistance = 0;

		for (
			i = 0;
			i + 2 < length;
			i += 3
		) {
			ar = a.rgb[ i ];
			ag = a.rgb[ i + 1 ];
			ab = a.rgb[ i + 2 ];

			br = b.rgb[ i ];
			bg = b.rgb[ i + 1 ];
			bb = b.rgb[ i + 2 ];

			/*
			 * Background is normalized to black by
			 * drawScaled().
			 */
			aForeground =
				Math.max(
					ar,
					ag,
					ab
				) > 8;

			bForeground =
				Math.max(
					br,
					bg,
					bb
				) > 8;

			if ( aForeground ) {
				foregroundA++;

				binA =
					(
						Math.min(
							3,
							ar >> 6
						) << 4
					) |
					(
						Math.min(
							3,
							ag >> 6
						) << 2
					) |
					Math.min(
						3,
						ab >> 6
					);

				histogramA[ binA ]++;
			}

			if ( bForeground ) {
				foregroundB++;

				binB =
					(
						Math.min(
							3,
							br >> 6
						) << 4
					) |
					(
						Math.min(
							3,
							bg >> 6
						) << 2
					) |
					Math.min(
						3,
						bb >> 6
					);

				histogramB[ binB ]++;
			}

			if (
				aForeground ||
				bForeground
			) {
				union++;
			}

			if (
				!aForeground ||
				!bForeground
			) {
				continue;
			}

			intersection++;

			dr = ar - br;
			dg = ag - bg;
			db = ab - bb;

			colorSum +=
				Math.sqrt(
					dr * dr +
					dg * dg +
					db * db
				) /
				441.67295593;
		}

		shapeDistance =
			union
				? 1 -
					intersection /
						union
				: 1;

		colorDistance =
			intersection
				? colorSum /
					intersection
				: 1;

		for (
			i = 0;
			i < 64;
			i++
		) {
			histogramDistance +=
				Math.abs(
					histogramA[ i ] /
						Math.max(
							1,
							foregroundA
						) -
					histogramB[ i ] /
						Math.max(
							1,
							foregroundB
						)
				);
		}

		/*
		 * Normalized histogram L1 range is 0..2.
		 */
		histogramDistance =
			Math.min(
				1,
				histogramDistance / 2
			);

		/*
		 * Foreground color is deliberately the largest
		 * contributor now.
		 */
		return Math.min(
			1,
			0.50 * colorDistance +
				0.25 * shapeDistance +
				0.15 * histogramDistance +
				0.10 * hashDistance
		);
	}

export {drawScaled,fingerprintDrawable,fingerprintDistance};
export const ICON_FINGERPRINT_ALGORITHM=6;
