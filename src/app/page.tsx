"use client";

import { useState, useEffect, useRef } from "react";
import ROSLIB from "roslib";

// Convert between degrees and radians
const deg2rad = (d: number): number => d * (Math.PI / 180);
const rad2deg = (r: number): number => r * (180 / Math.PI);

// Definir interfaces para los tipos de servicios ROS
interface MotorResponse {
  success: boolean;
  message?: string;
  motor_ids?: number[];
  positions?: number[];
  previous_positions?: number[];
}

export default function MotorControl() {
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const setServiceRef = useRef<ROSLIB.Service | null>(null);
  const availServiceRef = useRef<ROSLIB.Service | null>(null);
  const posServiceRef = useRef<ROSLIB.Service | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [connected, setConnected] = useState(false);
  const [motorIds, setMotorIds] = useState<number[]>([]);
  const [positions, setPositions] = useState<Record<number, number>>({});    // { [id]: currentPositionDeg }
  const [targets, setTargets] = useState<Record<number, number>>({});        // { [id]: targetPositionDeg }
  const [isMoving, setIsMoving] = useState<Record<number, boolean>>({});     // { [id]: boolean }
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const ROSBRIDGE_URL = process.env.NEXT_PUBLIC_ROSBRIDGE_URL;

  // Initialize ROS connection and services
  useEffect(() => {
    const ros = new ROSLIB.Ros({ url: ROSBRIDGE_URL });
    rosRef.current = ros;

    ros.on("connection", () => {
      setConnected(true);
      setLastMessage("Conectado a ROSBridge");

      // Crear servicios ROS
      setServiceRef.current = new ROSLIB.Service({
        ros,
        name: "/westwood_motor/set_motor_id_and_target",
        serviceType: "westwood_motor_interfaces/SetMotorIdAndTarget",
      });
      availServiceRef.current = new ROSLIB.Service({
        ros,
        name: "/westwood_motor/get_available_motors",
        serviceType: "westwood_motor_interfaces/GetAvailableMotors",
      });
      posServiceRef.current = new ROSLIB.Service({
        ros,
        name: "/westwood_motor/get_motor_positions",
        serviceType: "westwood_motor_interfaces/GetMotorPositions",
      });

      // Empezar polling periódico
      pollIntervalRef.current = setInterval(() => {
        // 1) Obtener IDs disponibles
        if (availServiceRef.current) {
          availServiceRef.current.callService({}, (res: MotorResponse) => {
            if (res.success && res.motor_ids) {
              setMotorIds(res.motor_ids);
            }
          });
        }
        // 2) Obtener posiciones en bloque
        const ids = motorIds.length ? motorIds : [];
        if (ids.length && posServiceRef.current) {
          posServiceRef.current.callService({ motor_ids: ids }, (res: MotorResponse) => {
            if (res.success && res.positions) {
              const newPos: Record<number, number> = {};
              res.positions.forEach((rad: number, idx: number) => {
                newPos[ids[idx]] = Math.round(rad2deg(rad));
              });
              setPositions(newPos);
            }
          });
        }
      }, 1000);
    });

    ros.on("error", (err: Error) => {
      setConnected(false);
      setLastMessage(`Error de conexión: ${err.message}`);
    });
    ros.on("close", () => {
      setConnected(false);
      setLastMessage("Conexión cerrada");
    });

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      ros.close();
    };
  }, [ROSBRIDGE_URL, motorIds]);

  // Función para mover un motor
  const moveMotor = (id: number, deg: number): void => {
    if (!setServiceRef.current) return;
    setIsMoving((m) => ({ ...m, [id]: true }));
    setLastMessage(`Moviendo motor ${id} a ${deg}°...`);

    const req = new ROSLIB.ServiceRequest({
      motor_ids: [id],
      target_positions: [deg2rad(deg)],
    });
    
    setServiceRef.current.callService(
      req,
      (res: MotorResponse) => {
        if (res.success) {
          const prevRad = res.previous_positions?.[0] || 0;
          const prevDeg = Math.round(rad2deg(prevRad));
          setLastMessage(`Motor ${id} se movió de ${prevDeg}° a ${deg}°`);
        } else {
          setLastMessage(`Error mot ${id}: ${res.message || 'Desconocido'}`);
        }
        setTargets((t) => ({ ...t, [id]: deg }));
        setTimeout(() => {
          setIsMoving((m) => ({ ...m, [id]: false }));
        }, 500);
      },
      (err: any) => {
        setLastMessage(`Error Llamada: ${err}`);
        setIsMoving((m) => ({ ...m, [id]: false }));
      }
    );
  };

  // Posiciones predefinidas en grados
  const presetPositions = [-360, -270, -180, -90, 0, 90, 180, 270, 360];

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Control de Motores</h1>
      <div className="flex items-center mb-4">
        <span
          className={`w-3 h-3 rounded-full mr-2 ${
            connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span>{connected ? "Conectado" : "Desconectado"}</span>
      </div>
      {lastMessage && <div className="mb-4 text-sm">{lastMessage}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {motorIds.map((id) => {
          const curr = positions[id] ?? 0;
          const tgt = targets[id] ?? curr;
          return (
            <div key={id} className="border rounded p-4 shadow-sm overflow-hidden">
              <div className="border-b border-gray-200 pb-2 mb-4">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold">Motor {id}</h2>
                  <div
                    className={`px-2 py-1 rounded-full text-xs ${
                      isMoving[id]
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {isMoving[id] ? "MOVIENDO" : "INACTIVO"}
                  </div>
                </div>
                <p className="text-sm text-gray-500">Control de posición en grados</p>
              </div>

              {/* Visualización de posición */}
              <div className="flex justify-center py-2">
                <div className="relative w-36 h-36">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full border-4 border-gray-200 flex items-center justify-center">
                      {/* Marcadores de grados */}
                      {[0, 45, 90, 135, 180, 225, 270, 315].map((degree) => (
                        <div
                          key={degree}
                          className="absolute w-full h-full"
                          style={{ transform: `rotate(${degree}deg)` }}
                        >
                          <div className="absolute top-0 left-1/2 -ml-0.5 w-1 h-2 bg-gray-400"></div>
                          <div className="absolute top-2 left-1/2 -ml-2 text-[8px] text-gray-500">
                            {degree}°
                          </div>
                        </div>
                      ))}

                      {/* Indicador del motor */}
                      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center relative">
                        <div
                          className="absolute w-full h-full transition-transform duration-300"
                          style={{ transform: `rotate(${tgt}deg)` }}
                        >
                          <div className="absolute top-0 left-1/2 -ml-0.5 w-1 h-10 bg-red-500"></div>
                        </div>
                        <div className="z-10 bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-inner">
                          <span className="font-mono font-bold text-sm">
                            {Math.round(tgt)}°
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Slider de posición */}
              <div className="space-y-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium">Posición actual:</span>
                  <span className="text-xs font-bold">{Math.round(curr)}°</span>
                </div>
                <input
                  type="range"
                  min="-360"
                  max="360"
                  step="1"
                  value={tgt}
                  onChange={(e) => moveMotor(id, Number(e.target.value))}
                  disabled={!connected}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>-360°</span>
                  <span>-180°</span>
                  <span>0°</span>
                  <span>180°</span>
                  <span>360°</span>
                </div>
              </div>

              {/* Botones de posiciones predefinidas */}
              <div className="space-y-1 mt-4">
                <span className="text-xs font-medium">Posiciones Predefinidas</span>
                <div className="grid grid-cols-3 gap-1">
                  {presetPositions.map((degrees) => (
                    <button
                      key={degrees}
                      onClick={() => moveMotor(id, degrees)}
                      disabled={!connected}
                      className={`px-2 py-1 text-xs font-medium rounded-md flex items-center justify-center ${
                        tgt === degrees
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                      } relative`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mr-1 opacity-70"
                      >
                        <path d="M21 2v6h-6"></path>
                        <path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path>
                      </svg>
                      {degrees}°
                      {tgt === degrees && (
                        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
