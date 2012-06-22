$(function() {

	// boostrap a list of existing houses. 
	// TODO (jessykate) retrieve real list from server
	/*
	bootstrapHouses = [
		{address: "21677 rainbow drive, cupertino, ca, 95014", bedrooms: 8, name:"Rainbow Mansion", 
			contact: "zwexlerberon@gmail.com", website: "http://rainbowmansion.com", latLong: "37.300079,-122.05498899999998",
			accommodations:true, events: true, description: "a warm and welcoming community in the south bay full of passionate and driven community builders."}, 
		{address: "775 14th Street, san francisco, ca, 94114", bedrooms: 13, name:"The Elements", 
			contact: "corwinh@gmail.com", latLong: "37.7675567,-122.4305766"}
	];

	// fake the saving while we don't have a persistence layer. 
	//Backbone.sync = function(method, model, options) {
	//	return 0;
	//};
	*/

	/////////////////////// UTIL ////////////////////////
	locationParse = function(locString) {
		// returns a list item of floats, [longitude, latitude] (in that order!)
		ll = locString.split(",");
		latitude = parseFloat(ll[0]);
		longitude = parseFloat(ll[1]);
		loc = [longitude, latitude];
		return loc;
	};

	////////////// MODELS & COLLECTIONS /////////////////

	window.House = Backbone.Model.extend({
		initialize: function() { },
		url: function() { 
			if (this.isNew()) {
				return "http://localhost:8080/api/v1/houses/?format=json";
			} else {
				return "http://localhost:8080/api/v1/houses/" + this.id + "?format=json";
			}
		},
		geocodeAddr: function() {
			// a model change event is set to trigger in the NewHouseView if geocoding succeeds
			var geocoder = new google.maps.Geocoder();
			that = this;
			geocoder.geocode( { 'address': this.get("address")}, function(results, status) {
				if (status == google.maps.GeocoderStatus.OK) {
					latStr = results[0].geometry.location.lat().toString();
					lngStr = results[0].geometry.location.lng().toString();
					var newLatLong = latStr + "," + lngStr;
					that.set({latLong: newLatLong});
					console.log("latLong was set to " + newLatLong);
				} else {
					console.log("Error: Geocode was not successful: " + status);
				}
			});
		}
	});

	window.Houses = Backbone.Collection.extend({
		model: House,
		// XXX (jks) careful with pagination and limits once list gets long
		url: "http://localhost:8080/api/v1/houses/?format=json",
		parse: function(response) {
			/* from the backbone docs: "The function is passed the raw response
			 * object, and should return the array of model attributes to be
			 * added to the collection. The default implementation is a no-op,
			 * simply passing through the JSON response." */
			
			// the tasty-pie API we are working with returns some metadata we
			// don't want to include in the model, such as limits and
			// pagination information. we need to pull out the models. 
			return response.objects;
		}
	});

	window.Location = Backbone.Model.extend({});

	window.Locations = Backbone.Collection.extend({
		model: Location,
		url: "http://localhost:8080/api/v1/locations/?format=json",
		parse: function(response) {
			return response.objects;
		}
	});

	/////////////////////// VIEWS ////////////////////////

	// houses needs to be declared before the objects below refer to it, since
	// javascript is evaluated immediately. 
	// XXX (jessykate) why does this not work when using "this"?
	window.houses = new Houses();

	window.HouseView = Backbone.View.extend({
		initialize: function() {
			this.template = _.template($("#house-template").html());
		},

		render: function() {
			console.log("rendering individual house view");
			console.log(this.model.toJSON());
			$(this.el).html(this.template( {house: this.model.toJSON()} ));
			return this;
		}

	});

	window.NewHouseView = Backbone.View.extend({
		events: {'click #form-submit': 'formSubmit'},

		initialize: function(options) {
			this.model.on('change:latLong', this.locationMap, this);
			this.model.on('sync', this.returnHome, true);
			this.template = _.template($("#signup-template").html());
			_.bindAll(this, 'render', 'formSubmit', 'locationMap');
		},

		render: function() {
			console.log("rendering new house form");
			$(this.el).html(this.template());
			
			// credit: http://stackoverflow.com/questions/1909441/jquery-keyup-delay
			var delay = function(callback, ms) {
				var timer = 0;
				return function(callback,ms) {
					clearTimeout(timer);
					timer = setTimeout(callback,ms);
				};
			}();
			
			var that = this;
			console.log(that.model);

			// register a location autocomplete function on the address input.
			var location_search_field = document.getElementById('form-address');
			var options = {
				types: ['geocode']
			}
			var autocomplete = new google.maps.places.Autocomplete(location_search_field, options);

			// also register a keyup function that, after a brief delay, will
			// geocode the address contained in the text field. 
			$('#form-address').keyup(function() {
				delay(function() {
					// get address field and geocode it, then display a map
					// with the house location marked. 
					var addr = $('#form-address').val();
					console.log("looking up lat long of address '" + addr + "'");
					that.model.set({address: addr}); 
					that.model.geocodeAddr();
				}, 3000 );
			});

			return this;
		},

		locationMap: function() {
			console.log("in locationMap().");

			// set up the map with the tile layer and a layer to put markers
			// in. 
			$("#house-map").html("");
			var map = new OpenLayers.Map("house-map");
			map.addLayer(new OpenLayers.Layer.OSM());
			var markerLayer = new OpenLayers.Layer.Markers( "Markers" );
			map.addLayer(markerLayer);

			var latLong = this.model.get("latLong");
			// returns location string as array
			loc = locationParse(latLong);
			var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
				new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
				new OpenLayers.Projection("EPSG:900913")
			);
			markerLayer.addMarker(new OpenLayers.Marker(lonlat));

			map.updateCenter = function(loc, zoom) {
				var fromProjection = new OpenLayers.Projection("EPSG:4326");   // Transform from WGS 1984
				var toProjection = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection
				// center the map somewhere in the middle of the world
				var mapCenter = new OpenLayers.LonLat(loc[0], loc[1]).transform( fromProjection, toProjection);
				// forces the tiles of the map to render. 
				this.setCenter(mapCenter, zoom);
			}

			var zoom = 15;
			map.updateCenter(loc, zoom);
		},

		formSubmit: function(e) {
			console.log("in formSubmit");
			houseAttr = this.houseFromForm(e);
			console.log(houseAttr);
			/* saving the verified model triggers the 'add' event on the model,
			 * which in turn calls app.navigate.  otherwise the create() call
			 * might not be done by the time navigate is called.  
			 */
			this.model.set(houseAttr);
			this.model.save(); 
			e.preventDefault();
		},

		houseFromForm: function(e) {
			houseAttr = {}
			// retrieve the form fields and populate a new House model with the info. 
			$('form input, form textarea').each(function() {
				if ( $(this).is(":checked") ) {
					houseAttr[$(this).attr("name")] = true;
				} else if ( !$(this).is("input[type=checkbox]") && $(this).val() ) {
					houseAttr[$(this).attr("name")] = $(this).val();
				}
			});
			return houseAttr;
		},

		returnHome: function() {
			console.log("sync event triggered, returning to Home View");
			app.navigate("/", {trigger:true});
		}

	});

	window.AppView = Backbone.View.extend({
		events: {'click #add-house': 'newHouseForm',
			'click #submit-location-search': 'doSearch',
			'click .row-link': 'displayHouse'
		},
	
		initialize: function(options) {
			this.collection = new Locations();
			this.collection.fetch();

			//houses.on('reset', this.render, this);
			this.template = _.template($("#listings-template").html());
			_.bindAll(this, 'render', 'newHouseForm', 'renderMap');
			this.render();

		},

		render: function() {
			$(this.el).html(this.template({houses: this.collection.toJSON()}));
			console.log("loading data tables plugin");
			$('#house-listing-table').dataTable();
			$('tr.row-link').hover( function() {
				$(this).toggleClass('hover');
			});
			// XXX initial renderMap should just be a bg, no objects (since
			// they're not loaded yet). 
			this.renderMap();

			// register a location autocomplete function on the search box.
			var location_search_field = document.getElementById('input-location-search');
			var options = {
				types: ['geocode']
			}
			var autocomplete = new google.maps.places.Autocomplete(location_search_field, options);

			return this;
		},

		doSearch: function(e) {
			console.log("in doSearch");
			// pull out the value of the input field, and do a text search on
			// the database model's address field. 
			var search_loc = $('#input-location-search').val();
			var radius = $('#radius-location-search').val();
			radius = parseInt(radius)*1000; // distance calculation returns value in meters. 
			console.log(search_loc);
			console.log(radius);
			console.log(this.collection.models);

			// geocode the search location
			that = this;
			var geocoder = new google.maps.Geocoder();
			geocoder.geocode({'address': search_loc}, function(results, status) {
				if (status == google.maps.GeocoderStatus.OK) {
					console.log("geocoding results for search location:");
					get_loc_matches(results[0].geometry.location);
				} else {
					console.log("Error: Geocode was not successful: " + status);
				}
			});
			
			get_loc_matches = function(search_gloc) {
				console.log("get_loc_matches: iterating over " + that.collection.length + "items");
				matches = [];
				that.collection.forEach(function(l) {
					// encode string and create a GLatLng object 
					// compute the distance between this location and the search location
					var this_loc = locationParse(l.get("latLong")); 
					console.log(this_loc);
					var this_gloc = new google.maps.LatLng(this_loc[1], this_loc[0]);
					console.log(this_gloc);
					console.log(search_gloc);
					var dist = google.maps.geometry.spherical.computeDistanceBetween(search_gloc, this_gloc);
					console.log(dist);
					if (dist < radius) {
						matches.push(l)
					};
				});
				console.log(matches);
			}; 
			e.preventDefault();
		},

		displayHouse: function(e) {
			console.log("in displayHouse");
			var path = $(e.target).parent().find("a").attr("href");
			console.log(path);
			app.navigate(path, {trigger:true});
			e.preventDefault();
			return false;
		},

		newHouseForm: function(e) {
			app.navigate("/new", {trigger:true});
			e.preventDefault();
		},

		renderMap: function() {
			console.log("in renderMap(). processing " + this.collection.length + " items.");

			// set up the map with the tile layer and a layer to put markers
			// in. 
			var map = new OpenLayers.Map("mainmap");
			//map.addControl(new OpenLayers.Control.MouseToolbar());
			map.addLayer(new OpenLayers.Layer.OSM());
			var markerLayer = new OpenLayers.Layer.Markers( "Markers" );
			map.addLayer(markerLayer);

			var locations = this.collection.pluck("latLong");
			locations.forEach(function(ll) {
				loc = locationParse(ll);
				var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
					new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
					new OpenLayers.Projection("EPSG:900913")
				);
				markerLayer.addMarker(new OpenLayers.Marker(lonlat));
			});

			map.updateCenter = function(locStr, zoom, that) {
				var fromProjection = new OpenLayers.Projection("EPSG:4326");   // Transform from WGS 1984
				var toProjection = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection
				// center the map somewhere in the middle of the world
				loc = locationParse(locStr)
				var mapCenter = new OpenLayers.LonLat(loc[0], loc[1]).transform( fromProjection, toProjection);
				// forces the tiles of the map to render. 
				this.setCenter(mapCenter, zoom);
			}

			var zoom = 2;
			map.updateCenter("33.137551, -163.476563", zoom, this);
		},

	});

	/////////////////////// ROUTER ////////////////////////
	
	var AppRouter = Backbone.Router.extend({
		// remember you can't visit urls directly unless you have the server
		// resonding to a request at this url. 

		routes: {
			"": "home",
			"new": "newHouse",
			"house/:houseid": "showHouse"
		},

		initialize: function() {
		},
		
		// view for searching and displaying filtered lists of houses. 
		home: function() {
			// TODO bootstrap properly
			// fetch() triggers the reset event, which renders the view. 
			var appview = new AppView({el:$("#content"), collection: houses});
			houses.fetch();
		},

		// view for creating and submitting (and eventually editing) a new
		// house
		newHouse: function() {
			house = new House();
			houseform = new NewHouseView({el: $("#content"), model: house});
			houseform.render();
		},

		// detail view for a specific house
		showHouse: function(houseid) {
			console.log("retreiving view for house id = " + houseid);
			var h = new House({id:houseid});
			h.fetch({success: function(model, resp){
				console.log(model);
				houseview = new HouseView({ el: $("#content"), model: model });
				houseview.render();
			}});
		}

	});

	app = new AppRouter();
	Backbone.history.start({pushState:true});

})

// TODO list
// + houses list should persist after return to home view
// + persistent storage
// + map not showing initial houses on load (delay map loading till fetch completes?)
// + click on and view individual houses. push state for individual house ids
// + use data tables to display and search house listings
// + main app view render() is called twice each time
// + fwd and back buttons still wonky.
// + calling urls directly is a problem because houses collection is not yet populated. 
// + new house submission event trigger now broken (event not being triggered properly)
// + newly added house is missing ID field when url is generated. 
// + fields with spaces are being b0rked (cf. name field)
// + decide what to show on map if we render the /new page directly. 

// change modernomad house model 
// - add slug 
// - rename summary to description
// - review suggestions from embassy peeps
// house url should use slug 
// homeview: 
// - map on LHS; call to action ("Find Communities!") on RHS. 
// - primary search on location. advanced options: other fields, radius. 
// - ui autocomplete hooked up to api search (http://docs.jquery.com/UI/Autocomplete)
// - map should update to reflect houses displayed in list. 
// individual house listing
// - show map (make this entirely contained in a popup/side div?)
// - map in bg with overlapping info div?
// - style
// map 
// - different color for the location most recently submitted.
// - framed popups with house info
// - custom icon 
// form validation - required fields, url, email, 
// bootstrap properly from server - first page of listings (depends what we want homepage to be)
// include error callbacks where appropriate (to match success callbacks)
// house edit - use django auth
// order listings by date added? (options: most recent, nearby, within xx km of yy)
// open layers form control - make less fugly
// recapcha for new house submission
// email reports
// address field search-ahead?
