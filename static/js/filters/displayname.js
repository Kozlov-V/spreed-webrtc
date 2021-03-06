/*
 * Spreed WebRTC.
 * Copyright (C) 2013-2014 struktur AG
 *
 * This file is part of Spreed WebRTC.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
define([], function() {

	// displayName
	return ["buddyData", "appData", "translation", function(buddyData, appData, translation) {
		var group_chat_id = "";
		var someones = {
			count: 1
		};
		var user_text = translation._("User");
		var someone_text = translation._("Someone");
		var me_text = translation._("Me");
		return function(id, me_ok) {
			if (id === group_chat_id) {
				return "";
			}
			var scope = buddyData.lookup(id);
			if (scope) {
				if (scope.displayName) {
					return scope.displayName;
				}
				return user_text + " " + scope.buddyIndex;
			} else {
				var data = appData.get();
				if (data) {
					if (id === data.id) {
						if (me_ok) {
							return me_text;
						}
						if (data.master.displayName) {
							return data.master.displayName;
						}
						return me_text;
					}
				}
				var someone = someones[id];
				if (!someone) {
					someone = someone_text + " " + someones.count++;
					someones[id] = someone;
				}
				return someone;
			}
		};
	}];

});
