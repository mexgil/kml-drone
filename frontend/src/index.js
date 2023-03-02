import { Viewer, SampledPositionProperty, ClockRange, VelocityOrientationProperty,  TimeIntervalCollection,
    JulianDate, HeadingPitchRange, Cartesian3, Color, TimeInterval,
    PerspectiveFrustum, FrustumOutlineGeometry, Math  as  CesiumMath } from "cesium"
import "cesium/Widgets/widgets.css"
import "../src/css/main.css"

const viewer = new Viewer('cesiumContainer', {
    
    baseLayerPicker : false,
    fullscreenButton : false,
    vrButton : false,
    geocoder : false,
    homeButton : false,
    navigationHelpButton : false,
    shouldAnimate:  true
})

const settings = {
    MAX_VELOCITY: 50,
    START_INDEX: 0,
    END_INDEX: 0,
    _leadTime: 0,
    set LEAD_TIME(val) {
        _leadTime = val
    },
    get LEAD_TIME() {
        return this._leadTime > 0 ? this._leadTime : undefined
    },
    _trailTime: 0,
    set TRAIL_TIME(val) {
        this._trailTime = val
    },
    get TRAIL_TIME() {
        return this._trailTime > 0 ? this._trailTime : undefined
    },

}

let waypointEntities = []
let droneRouteEntity = undefined

const parseFeature  =  (feature, settings)  =>  {
    const coordinates = feature.geometry.coordinates.splice(settings.START_INDEX, 
        (settings.END_INDEX == 0 ? feature.geometry.coordinates.length : settings.END_INDEX))
    const times =  feature.properties.times.splice(settings.START_INDEX, 
        (settings.END_INDEX == 0 ? feature.properties.times.length : settings.END_INDEX))
    let  prevPos  =   Cartesian3.fromDegrees(...coordinates[0])
    let  prevTime  =  JulianDate.fromIso8601(times[0])
    let  prevSpeed =  0
    const  cartesians  = [prevPos]
    const  julianDates = [prevTime]
    const  descriptions = [`<div> 
    <h3> Точка маршрута. </h3>
    <p> Индекс: 0 </p>
    </div>`]
    for (let  i  =  1;  i<  coordinates.length; i+=1)  {
        const point  = coordinates[i]
        const pos = Cartesian3.fromDegrees(...point)
        const time = JulianDate.fromIso8601(times[i])

        const distToPrev =  Cartesian3.distance(prevPos,pos)
        const timeDelta  =  JulianDate.compare(time,  prevTime)
        const speed  =  distToPrev /  timeDelta
        const velocity  =  (speed - prevSpeed)  /  timeDelta

        if  (Math.abs(velocity) < (settings.MAX_VELOCITY > 0 ? settings.MAX_VELOCITY : -Infinity))   {
            cartesians.push(pos)
            julianDates.push(time)
            descriptions.push(`<div> 
            <h3> Точка маршрута. </h3>
            <p> Индекс: ${settings.START_INDEX + i} </p>
            <p> Координаты (cartesian3): ${pos} </p>
            <p> Координаты (географические): ${point} </p>
            <p> Растояние от предыдущей точки (м): ${distToPrev.toFixed(2)} </p> 
            <p> Дельта времени (с):  ${timeDelta.toFixed(2)} </p> 
            <p> Дата (с):  ${time.toString()} </p> 
            <p> Скорость (м/c):  ${speed.toFixed(2)}  </p>
            <p> Ускорение (м/c^2):  ${velocity.toFixed(2)} </p>
            </div>`)
            prevPos =  pos
            prevTime = time
            prevSpeed = speed
        }
 
    }
    return [cartesians, julianDates, descriptions]
}


const generateSampledPositionProperty = (cartesians, julianDates) => {
    const property = new SampledPositionProperty()
    for (let i=0;i<cartesians.length;i++) {
        property.addSample(julianDates[i], cartesians[i])
    }
    return property
}

const addPositions  = (cartesians, descriptions, viewer) => {
    const pointEntities = []
    for (let i=0;i<cartesians.length;i++) {
        const pointEntity  =  viewer.entities.add({
            position: cartesians[i],
            point: {
                pixelSize: 8,
                color: Color.RED,
            }   
        })
        pointEntity.description = descriptions[i]
        pointEntities.push(pointEntity)
    }

    return pointEntities
}

const showPointEntities = (pointEntities) => {
    pointEntities.forEach(pointEntity => {
        pointEntity.show = true
    })
}

const hidePointEntities = (pointEntities) => {
    pointEntities.forEach(pointEntity => {
        pointEntity.show = false
    })
}   

const removePointEntities = (pointEntities, viewer) => {
    pointEntities.forEach(pointEntity => {
        viewer.entities.remove(pointEntity)
    })
    return []
}

const trackDrone = (droneRouteEntity) => {
    if (droneRouteEntity!=undefined) {
        viewer.trackedEntity = droneRouteEntity
    }
}

const zoomToDrone = (droneRouteEntity) => {
    if (droneRouteEntity!=undefined) {
        viewer.trackedEntity = undefined
        viewer.zoomTo(droneRouteEntity,new HeadingPitchRange(0, CesiumMath.toRadians(-90),20))
    }
}

const showDroneRoute = (droneRouteEntity) => {
    if(droneRouteEntity) {
        droneRouteEntity.path.show = true
    }
}

const hideDroneRoute = (droneRouteEntity) => {
    if(droneRouteEntity) {
        droneRouteEntity.path.show = false
    }
}



const cleanup = (waypointEntities, droneRouteEntity, viewer) => {
    const points = removePointEntities(waypointEntities,viewer)
    if (droneRouteEntity) {
        viewer.entities.remove(droneRouteEntity)
    }
    return [points, undefined]
}


const setClockToFeatureTimeline = (julianDates, viewer) => {
    const start = julianDates[0]
    const stop = julianDates[julianDates.length - 1]
    viewer.clock.startTime = start.clone()
    viewer.clock.stopTime = stop.clone()
    viewer.clock.currentTime = start.clone()
    viewer.clock.clockRange = ClockRange.LOOP_STOP
    viewer.clock.multiplier = 10
    viewer.timeline.zoomTo(start, stop)
    return [start, stop]
}

async function sendData () {
    const fileData = new FormData()
    fileData.append('file', document.getElementById('kml_upload').files[0])

    try {
        const resp = await fetch('http://localhost:8000/kml2geojson', {
            method: 'POST',
            body: fileData
        })

        if (resp.status >= 400 && resp.status < 600) {
            throw new Error(`Ошибка запроса на сервер: ${resp.status}`)
        }
      
        const data = await resp.json()

        cleanup(waypointEntities, droneRouteEntity, viewer)

        const geoJSON = data.geoJSON  
        const [cartesians, julianDates, descriptions] = parseFeature(geoJSON.features[0],settings)
        const position = generateSampledPositionProperty(cartesians, julianDates)
        waypointEntities = addPositions(cartesians, descriptions, viewer)
        const [start, stop] = setClockToFeatureTimeline(julianDates, viewer)

        const availability = new TimeIntervalCollection([
            new TimeInterval({
                start: start,
                stop: stop,
            })
        ])
        
        droneRouteEntity = viewer.entities.add({
            availability: availability,
            position: position,
            orientation: new VelocityOrientationProperty(position),
            model: {
                uri: "Models/CesiumDrone.glb",
                minimumPixelSize: 64,
            },
            path: {
                material:  Color.WHITE,
                width: 5,
                leadTime: settings.LEAD_TIME,
                trailTime: settings.TRAIL_TIME,
            },
        
    })

    zoomToDrone(droneRouteEntity)
        
    
    } catch(err) {
        cleanup(waypointEntities,droneRouteEntity,viewer)
        console.log(err)
    }

}


document.getElementById('kml_upload').addEventListener('change', sendData)
document.getElementById("zoom_to_drone").addEventListener('click', () => zoomToDrone(droneRouteEntity))
document.getElementById("track_drone").addEventListener('click', () => trackDrone(droneRouteEntity))

document.getElementById("show_waypoints").addEventListener('click', () => showPointEntities(waypointEntities))
document.getElementById("hide_waypoints").addEventListener('click', () => hidePointEntities(waypointEntities))

document.getElementById("show_drone_route").addEventListener('click', () => showDroneRoute(droneRouteEntity))
document.getElementById("hide_drone_route").addEventListener('click', () => hideDroneRoute(droneRouteEntity))


