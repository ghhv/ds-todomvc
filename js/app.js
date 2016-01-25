/*global ko, Router */
(function () {
	'use strict';

	var ENTER_KEY = 13;
	var ESCAPE_KEY = 27;

	// A factory function we can use to create binding handlers for specific
	// keycodes.
	function keyhandlerBindingFactory(keyCode) {
		return {
			init: function (element, valueAccessor, allBindingsAccessor, data, bindingContext) {
				var wrappedHandler, newValueAccessor;

				// wrap the handler with a check for the enter key
				wrappedHandler = function (data, event) {
					if (event.keyCode === keyCode) {
						valueAccessor().call(this, data, event);
					}
				};

				// create a valueAccessor with the options that we would want to pass to the event binding
				newValueAccessor = function () {
					return {
						keyup: wrappedHandler
					};
				};

				// call the real event binding's init function
				ko.bindingHandlers.event.init(element, newValueAccessor, allBindingsAccessor, data, bindingContext);
			}
		};
	}

	// a custom binding to handle the enter key
	ko.bindingHandlers.enterKey = keyhandlerBindingFactory(ENTER_KEY);

	// another custom binding, this time to handle the escape key
	ko.bindingHandlers.escapeKey = keyhandlerBindingFactory(ESCAPE_KEY);

	// wrapper to hasFocus that also selects text and applies focus async
	ko.bindingHandlers.selectAndFocus = {
		init: function (element, valueAccessor, allBindingsAccessor, bindingContext) {
			ko.bindingHandlers.hasFocus.init(element, valueAccessor, allBindingsAccessor, bindingContext);
			ko.utils.registerEventHandler(element, 'focus', function () {
				element.focus();
			});
		},
		update: function (element, valueAccessor) {
			ko.utils.unwrapObservable(valueAccessor()); // for dependency
			// ensure that element is visible before trying to focus
			setTimeout(function () {
				ko.bindingHandlers.hasFocus.update(element, valueAccessor);
			}, 0);
		}
	};

	// represent a single todo item
	var Todo = function ( recordName ) {
		this.recordName = recordName;
		this.record = ds.record.getRecord( recordName );
		this.title = koTools.getObservable( this.record, 'title' );
		this.completed = koTools.getObservable( this.record, 'completed' );
		this.editing = ko.observable();
	};

	// our main view model
	var ViewModel = function () {
		// map array of passed in todos to an observableArray of Todo objects
		this._todoList = ds.record.getList( 'todos' );
		this.todos = koTools.getViewList( Todo, this._todoList ).entries;


		// store the new todo value being entered
		this.current = ko.observable();
		this.showMode = ko.observable('all');

		this.filteredTodos = ko.computed(function () {
			switch (this.showMode()) {
			case 'active':
				return this.todos().filter(function (todo) {
					return !todo.completed();
				});
			case 'completed':
				return this.todos().filter(function (todo) {
					return todo.completed();
				});
			default:
				return this.todos();
			}
		}.bind(this));

		// add a new todo, when enter key is pressed
		this.add = function () {
			var current = this.current().trim();
			if (current) {
				var id = 'todo/' + ds.getUid();
				ds.record.getRecord( id ).set({
					title: current, 
					completed: false,
					editing: false
				});
				ds.event.emit( '$slack:outbound-xa32asfd', current );
				this._todoList.addEntry( id );
				this.current('');
			}
		}.bind(this);

		// remove a single todo
		this.remove = function (todo) {
			todo.record.delete();
			this._todoList.removeEntry( todo.record.name );
		}.bind(this);

		// remove all completed todos
		this.removeCompleted = function () {
			this.todos.remove(function (todo) {
				return todo.completed();
			});
		}.bind(this);

		// edit an item
		this.editItem = function (item) {
			item.editing(true);
			item.previousTitle = item.title();
		}.bind(this);

		// stop editing an item.  Remove the item, if it is now empty
		this.saveEditing = function (item) {
			item.editing(false);

			var title = item.title();
			var trimmedTitle = title.trim();

			// Observable value changes are not triggered if they're consisting of whitespaces only
			// Therefore we've to compare untrimmed version with a trimmed one to chech whether anything changed
			// And if yes, we've to set the new value manually
			if (title !== trimmedTitle) {
				item.title(trimmedTitle);
			}

			if (!trimmedTitle) {
				this.remove(item);
			}
		}.bind(this);

		// cancel editing an item and revert to the previous content
		this.cancelEditing = function (item) {
			item.editing(false);
			item.title(item.previousTitle);
		}.bind(this);

		// count of all completed todos
		this.completedCount = ko.computed(function () {
			return this.todos().filter(function (todo) {
				return todo.completed();
			}).length;
		}.bind(this));

		// count of todos that are not complete
		this.remainingCount = ko.computed(function () {
			return this.todos().length - this.completedCount();
		}.bind(this));

		// writeable computed observable to handle marking all complete/incomplete
		this.allCompleted = ko.computed({
			//always return true/false based on the done flag of all todos
			read: function () {
				return !this.remainingCount();
			}.bind(this),
			// set all todos to the written value (true/false)
			write: function (newValue) {
				this.todos().forEach(function (todo) {
					// set even if value is the same, as subscribers are not notified in that case
					todo.completed(newValue);
				});
			}.bind(this)
		});

		// helper function to keep expressions out of markup
		this.getLabel = function (count) {
			return ko.utils.unwrapObservable(count) === 1 ? 'item' : 'items';
		}.bind(this);


	};

	var koTools = new KoTools( ko );
	var ds = deepstream( '52.58.21.116:6020' ).login({}, function(){
		var viewModel = new ViewModel();
		ko.applyBindings(viewModel);

		// set up filter routing
		/*jshint newcap:false */
		Router({ '/:filter': viewModel.showMode }).init();
	});
	
}());
