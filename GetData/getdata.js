'use strict';

// Wrap everything in an anonymous function to avoid polluting the global namespace
(function () {
  $(document).ready(function () {
    console.log('foo');


    tableau.extensions.initializeAsync().then(function () {
      // Since dataSource info is attached to the worksheet, we will perform
      // one async call per worksheet to get every dataSource used in this
      // dashboard.  This demonstrates the use of Promise.all to combine
      // promises together and wait for each of them to resolve.
      let dataSourceFetchPromises = [];




      //  After initialization, ask Tableau what sheets are available
      const worksheets = tableau.extensions.dashboardContent.dashboard.worksheets;
      console.log("worksheets:");
      console.table(worksheets);

      var erData = worksheets.find(function (sheet) {
        console.log("sheet.name:", sheet.name)
        return sheet.name === "Attorney Table w/ Search";
      });
      console.log("erData", erData);

      erData.getSummaryDataAsync().then(data => {
        let dataArr = processDataTable(data);
        buildGraph(dataArr);
      });

      erData.addEventListener(tableau.TableauEventType.FilterChanged, handler => {
        console.log("filter changed!", handler);
        handler.worksheet.getSummaryDataAsync().then(data => {
          let dataArr = processDataTable(data);
          buildGraph(dataArr);
        });
      });

      // Maps dataSource id to dataSource so we can keep track of unique dataSources.
      let dashboardDataSources = {};

      // To get dataSource info, first get the dashboard.
      const dashboard = tableau.extensions.dashboardContent.dashboard;

      // Then loop through each worksheet and get its dataSources, save promise for later.
      dashboard.worksheets.forEach(function (worksheet) {
        dataSourceFetchPromises.push(worksheet.getDataSourcesAsync());
      });

      Promise.all(dataSourceFetchPromises).then(function (fetchResults) {
        fetchResults.forEach(function (dataSourcesForWorksheet) {
          dataSourcesForWorksheet.forEach(function (dataSource) {
            if (!dashboardDataSources[dataSource.id]) { // We've already seen it, skip it.
              dashboardDataSources[dataSource.id] = dataSource;
            }
          });
        });

        buildDataSourcesTable(dashboardDataSources);

        // This just modifies the UI by removing the loading banner and showing the dataSources table.
        $('#loading').addClass('hidden');
        $('#dataSourcesTable').removeClass('hidden').addClass('show');
      });
    }, function (err) {
      // Something went wrong in initialization.
      console.log('Error while Initializing: ' + err.toString());
    });
  });

  // Refreshes the given dataSource.
  function refreshDataSource(dataSource) {
    dataSource.refreshAsync().then(function () {
      console.log(dataSource.name + ': Refreshed Successfully');
    });
  }

  // Displays a modal dialog with more details about the given dataSource.
  function showModal(dataSource) {
    let modal = $('#infoModal');

    $('#nameDetail').text(dataSource.name);
    $('#idDetail').text(dataSource.id);
    $('#typeDetail').text((dataSource.isExtract) ? 'Extract' : 'Live');

    // Loop through every field in the dataSource and concat it to a string.
    let fieldNamesStr = '';
    dataSource.fields.forEach(function (field) {
      fieldNamesStr += field.name + ', ';
    });

    // Slice off the last ", " for formatting.
    $('#fieldsDetail').text(fieldNamesStr.slice(0, -2));

    dataSource.getConnectionSummariesAsync().then(function (connectionSummaries) {
      // Loop through each connection summary and list the connection's
      // name and type in the info field
      let connectionsStr = '';
      connectionSummaries.forEach(function (summary) {
        connectionsStr += summary.name + ': ' + summary.type + ', ';
      });

      // Slice of the last ", " for formatting.
      $('#connectionsDetail').text(connectionsStr.slice(0, -2));
    });

    dataSource.getActiveTablesAsync().then(function (activeTables) {
      // Loop through each table that was used in creating this datasource
      let tableStr = '';
      activeTables.forEach(function (table) {
        tableStr += table.name + ', ';
      });

      // Slice of the last ", " for formatting.
      $('#activeTablesDetail').text(tableStr.slice(0, -2));
    });

    modal.modal('show');
  }

  // Constructs UI that displays all the dataSources in this dashboard
  // given a mapping from dataSourceId to dataSource objects.
  function buildDataSourcesTable(dataSources) {
    // Clear the table first.
    $('#dataSourcesTable > tbody tr').remove();
    const dataSourcesTable = $('#dataSourcesTable > tbody')[0];

    // Add an entry to the dataSources table for each dataSource.
    for (let dataSourceId in dataSources) {
      const dataSource = dataSources[dataSourceId];

      let newRow = dataSourcesTable.insertRow(dataSourcesTable.rows.length);
      let nameCell = newRow.insertCell(0);
      let refreshCell = newRow.insertCell(1);
      let infoCell = newRow.insertCell(2);

      let refreshButton = document.createElement('button');
      refreshButton.innerHTML = ('Refresh Now');
      refreshButton.type = 'button';
      refreshButton.className = 'btn btn-primary';
      refreshButton.addEventListener('click', function () { refreshDataSource(dataSource); });

      let infoSpan = document.createElement('span');
      infoSpan.className = 'glyphicon glyphicon-info-sign';
      infoSpan.addEventListener('click', function () { showModal(dataSource); });

      nameCell.innerHTML = dataSource.name;
      refreshCell.appendChild(refreshButton);
      infoCell.appendChild(infoSpan);
    }
  }

  function processDataTable(dataTable) {
    console.log("dataTable", dataTable);

    let dataArr = [];
    let dataJson;
    dataTable.data.map(d => {
      dataJson = {};
      dataJson[dataTable.columns[0].fieldName] = d[0].value; //1st column
      dataJson[dataTable.columns[1].fieldName] = d[1].value; //2nd column
      dataJson[dataTable.columns[2].fieldName] = d[2].value; //3rd column
      dataArr.push(dataJson);
    });
    console.log("dataArr", dataArr);
    return dataArr;
  }

  function buildGraph(data) {
    var svg = d3.select("svg"),
      width = +svg.attr("width"),
      height = +svg.attr("height");

    var color = d3.scaleOrdinal(d3.schemeAccent);

    var simulation = d3.forceSimulation()
      .force("link", d3.forceLink().id(function (d) { return d.id; }))
      .force("charge", d3.forceManyBody())
      .force("center", d3.forceCenter(width / 2, height / 2));

    var canonicalNodes = _.uniqBy(data, "canonical_component_id").map(canonical => {
      return {
        "id": "canonical" + canonical.canonical_component_id,
        "name": "Group " + canonical.canonical_component_id,
        "group": 8
      }
    });
    var sourceNodes = _.uniqBy(data, "attorney_id_target").map(source => {
      return {
        "id": "source" + source.attorney_id_target,
        "name": source.full_name_source,
        "group": 1
      }
    });
    var links = _.map(data, row => {
      return {
        "source": "canonical" + row.canonical_component_id,
        "target": "source" + row.attorney_id_target,
        "value": 1
      }
    });

    const graph = {
      "nodes": _.union(canonicalNodes, sourceNodes),
      "links": links
    };
    console.log("graph", graph);

    var link = svg.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graph.links)
      .enter().append("line")
      .attr("stroke-width", function (d) { return Math.sqrt(d.value); });

    var node = svg.append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(graph.nodes)
      .enter().append("circle")
      .attr("r", 5)
      .attr("fill", function (d) { return color(d.group); })
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    var label = svg.append("g")
      .attr("class", "labels")
      .selectAll("circle")
      .data(graph.nodes)
      .enter().append("text")
      .text(function (d) { return d.name; })

    simulation
      .nodes(graph.nodes)
      .on("tick", ticked);

    simulation.force("link")
      .links(graph.links);

    function ticked() {
      link
        .attr("x1", function (d) { return d.source.x; })
        .attr("y1", function (d) { return d.source.y; })
        .attr("x2", function (d) { return d.target.x; })
        .attr("y2", function (d) { return d.target.y; });

      node
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; });

      label
        .attr("x", function (d) { return d.x; })
        .attr("y", function (d) { return d.y - 10; });
    }


    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }
})();
